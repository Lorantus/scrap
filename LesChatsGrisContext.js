import request from 'request-promise';
import cheerio from 'cheerio';
import fs from 'fs';
import sanitize from 'sanitize-filename';
import NodeID3 from 'node-id3';
import URL from 'url';
import DownloadEpisode from './DownloadEpisode';

export default {
    buildContext({url, destinationFolder}) {
        const domain = URL.resolve(url, '/');
    
        const getExtention = function(fileName) {
            return fileName.split('.').pop();
        }    
    
        if (!fs.existsSync(destinationFolder)){
            fs.mkdirSync(destinationFolder);
        }

        return {
            downloadEntryBuilder(htmlElement, attributeExtractor = (element, attribut) => element[attribut]) {
                const entry = {};            
                return {
                    append(attribute, value) {
                        entry[attribute] = value;
                        return this;
                    },
                    
                    extract(attribute, extractor = value => value) {
                        entry[attribute] = extractor(attributeExtractor(htmlElement, attribute));
                        return this;
                    },
            
                    build() {
                        return entry;
                    }
                }
            },
    
            updateID3Tags(fullFileName, entry) {
                const tags = {
                    album: entry['emission-title'],
                    title: entry['diffusion-title'],
                    artist: entry['author'],
                    year: new Date(entry['start-time'] * 1000).toISOString().substring(0, 4),
                    length: new Date((entry['end-time'] - entry['start-time']) * 1000).toISOString().substring(11, 19),
                    copyright: 'Radio France',
                    genre: '(186)', // PODCAST
                    comment: {
                        language: '',
                        shortText: '',
                        text: entry['diffusion-path']
                    },
                    /* TODO
                    image: {
                        mime: 'jpeg',
                        type: { id: 3, name: 'front cover' },
                        description: undefined,
                        imageBuffer: <Buffer ff d8 ff e0 00 10 4a 46 49 46 00 01 02 00 00 64 00 64 00 00 ff ec 00 11 44 75 63 6b 79 00 01 00 04 00 00 00 64 0000 ff ee 00 0e 41 64 6f 62 65 00 64 ... > 
                    }
                    */
                };
    
                NodeID3.write(tags, fullFileName);
            },

            getEpisodeContext(episode) {
                const dateString = new Date(episode['start-time'] * 1000).toISOString().substring(0, 10),
                    url = episode['url'],
                    name = sanitize(episode['diffusion-title']),
                    ext = getExtention(url),
                    fileName = `${dateString}-${name}.${ext}`;
                return {
                    extra: episode,
                    name: `${dateString}-${name}`,
                    fileName,
                    url
                }
            },
    
            download(episode) {
                const episodeContext = this.getEpisodeContext(episode),
                    fullFileName = `${destinationFolder}/${episodeContext.fileName}`;
    
                return DownloadEpisode.download(episodeContext.url, fullFileName)
                    .then(() => this.updateID3Tags(fullFileName, episodeContext.extra));
            },
    
            extractDownloadEntryFromPage($) {
                const downloadEntries = [];
    
                $('div.diffusions-list article').each((index, article) => {
                    const articleJQ = $(article);
                    const playButton = $(articleJQ.find('button[data-diffusion-title].playable')[0]);
                    if(playButton.length) {
                        const downloadEntry = this.downloadEntryBuilder(playButton, 
                            (element, attribut) => {                    
                                const dataElement = element.attr(`data-${attribut}`);
                                return dataElement ? dataElement.trim() : dataElement;
                            })
                            .extract('url')
                            .extract('diffusion-title')
                            .extract('emission-title')
                            .extract('start-time', attribut => parseInt(attribut))
                            .extract('end-time', attribut => parseInt(attribut))
                            .extract('diffusion-path', attribut => URL.resolve(domain, attribut));
        
                        const author = $(articleJQ.find('span.rich-section-list-item-content-infos-author > a')[0]);
                        downloadEntry.append('author', author.attr('title'));
        
                        // TODO
                        // downloadEntry.append('track-number', index);
                        const entry = downloadEntry.build();

                        const itemVisual = $(articleJQ.find('div.rich-section-list-item-visual > a')[0]);
                        if(itemVisual) {
                            entry['href'] = itemVisual.attr('href');
                        }

                        const startTime = parseInt(articleJQ.attr('data-start-time')),
                            endTime = startTime + (entry['end-time'] - entry['start-time']);
                        entry['start-time'] = startTime;
                        entry['end-time'] = endTime;

                        downloadEntries.push(entry);
                    }
                });
                
                return downloadEntries;
            },
    
            buildDownloadPage(uri, queryParams) {
                return request({
                    uri,
                    qs: queryParams,
                    transform: body => this.extractDownloadEntryFromPage(cheerio.load(body))
                });
            },

            downloadAction(pages, action) {
                const pagesToAppend = (!pages ? [1] : (Array.isArray(pages) ? pages : [pages]));
                return Promise.all(pagesToAppend.map(page => {
                    return this.buildDownloadPage(url, page > 1 ? { p: `${page}`} : {})
                        .then(downloadEntries =>  Promise.all(downloadEntries.map(action)))
                        .catch(error => console.log(error));
                }));
            },

            extractDownloadInformations(pages) {
                const urls = [];
                this.downloadAction(pages, 
                    downloadEntry => {
                        const context = this.getEpisodeContext(downloadEntry);
                        urls.push({ 
                            url: context.url, 
                            fileName: context.name
                        });
                    })
                    .then(() => {
                        console.log("[playlist]");
                        urls.forEach((context, index) => {
                            const currentIndex = index + 1;
                            console.log(`File${currentIndex}=${context.url}`)
                            console.log(`Title${currentIndex}=${context.fileName}`);
                        });
                    });
            },
    
            downloadPages(pages) {
                this.downloadAction(pages, downloadEntry => this.download(downloadEntry));
            }
        }
    }
}
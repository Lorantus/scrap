const request = require('request-promise'),
    cheerio = require('cheerio'),
    progress = require('request-progress'),
    fs = require('fs'),
    sanitize = require('sanitize-filename'),
    ProgressBar = require('ascii-progress'),
    NodeID3 = require('node-id3'),
    URL = require('url'),
    downloadFileSync = require('download-file-sync');

function buildContext({url, destinationFolder}) {
    const domain = URL.resolve(url, '/');

    const getExtention = function(fileName) {
        return fileName.split('.').pop();
    }    

    if (!fs.existsSync(destinationFolder)){
        fs.mkdirSync(destinationFolder);
    }

    return {
        downloadEntryBuilder(htmlElement, attributeExtractor = (element, attribut) => element[attribut]) {
            const entry = {},
                logosCache = {};
        
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

        download(entry, cb) {
            const dateString = new Date(entry['start-time'] * 1000).toISOString().substring(0, 10),
                name = sanitize(entry['diffusion-title']),
                ext = getExtention(entry['url']),
                fileName = `${dateString}-${name}.${ext}`,
                fullFileName = `${destinationFolder}/${fileName}`;

            const progressBar = new ProgressBar({ 
                schema: `[:bar] :percent ${fileName} :statut`,
                width : 80,
                total : 100
            });

            fs.access(fullFileName, err => {
                if(err && err.code === 'ENOENT') {
                    const writefileStream = fs.createWriteStream(fullFileName);
                    progress(request(entry['url']))
                        .on('progress', state => {
                            progressBar.update(state.percent, {statut: ''});
                        })
                        .on('end', () => {
                            writefileStream.end();
                            progressBar.update(100, {statut: ', terminé'});
                            this.updateID3Tags(fullFileName, entry);
                        })
                        .on('error', err => {
                            writefileStream.end();
                            progressBar.update(0, {statut: err.message});
                            fs.unlink(fullFileName)
                        })
                        .pipe(writefileStream);
                }
            });
        },

        extractDownloadEntryFromPage($) {
            const downloadEntries = [];

            $('div.diffusions-list article').each((index, article) => {
                const playButton = $($(article).find('button[data-diffusion-title].playable')[0]);
                const downloadEntry = this.downloadEntryBuilder(playButton, (element, attribut) => element.attr(`data-${attribut}`).trim())
                    .extract('url')
                    .extract('diffusion-title')
                    .extract('emission-title')
                    .extract('start-time', attribut => parseInt(attribut))
                    .extract('end-time', attribut => parseInt(attribut))
                    .extract('diffusion-path', attribut => URL.resolve(domain, attribut));

                const author = $($(article).find('span.rich-section-list-item-content-infos-author > a')[0]);
                downloadEntry.append('author', author.attr('title'));

                // TODO
                // downloadEntry.append('track-number', index);

                downloadEntries.push(downloadEntry.build());
            });
            
            return [downloadEntries[0]];
        },

        buildDownloadPage(uri, queryParams) {
            return request({
                uri,
                qs: queryParams,
                transform: body => this.extractDownloadEntryFromPage(cheerio.load(body))
            });
        },

        downloadPages(pages) {
            (typeof pages === 'Array' ? pages : [pages]).forEach(page => {
                this.buildDownloadPage(url, page > 1 ? { p: `${page}`} : {})
                    .then(downloadEntries => {
                        downloadEntries.forEach(downloadEntry => this.download(downloadEntry));
                    })
                    .catch(error => console.log(error));
            })
        }
    }
}

buildContext({
    url: 'https://www.franceinter.fr/emissions/tous-les-chats-sont-gris', 
    destinationFolder: './dest'
}).downloadPages([1]);
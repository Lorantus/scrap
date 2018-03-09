import request from 'request-promise';
import progress from 'request-progress';
import ProgressBar from 'ascii-progress';
import fs from 'fs';

export default {
    download(url, fileName, cb) {
        const progressBar = new ProgressBar({ 
            schema: `[:bar] :percent ${fileName} :statut`,
            width : 80,
            total : 100
        });

        const progressCallBack = cb && cb.progress && typeof cb.progress === 'function' ?
            cb.progress : () => {};

        return new Promise((resolve, reject) => {
            fs.access(fileName, err => {
                if(err && err.code === 'ENOENT') {
                    const writefileStream = fs.createWriteStream(fileName);
                    progress(request(url))
                        .on('progress', state => {
                            progressBar.update(state.percent, {statut: ''});
                            progressCallBack();
                        })
                        .on('end', () => {
                            progressBar.update(100, {statut: ', terminé'});
                            writefileStream.end();
                            resolve();
                        })
                        .on('error', err => {
                            progressBar.update(0, {statut: err.message});
                            writefileStream.end();
                            fs.unlink(fileName);
                            reject(err);
                        })
                        .pipe(writefileStream);
                }
            })
        })
    }
}
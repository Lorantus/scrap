import commander from 'commander';
import Context from './LesChatsGrisContext';

commander
    .version('0.0.1', '-v, --version')
    .option('-p, --pages <n>', "Numéro des pages (ex: 1,3,4)", val => val.split(','))
    .option('-d, --dest [destination]', "Répertoire de destination")
    .option('-i, --informations', "Extrait uniquement les informations titre et url", )
    .parse(process.argv);

const url = 'https://www.franceinter.fr/emissions/tous-les-chats-sont-gris';
//const url = 'https://www.franceinter.fr/emissions/sur-les-epaules-de-darwin';

const context = Context.buildContext({ 
    url: url, 
    destinationFolder: commander.dest ? commander.dest : './dest'
});

context.extractDownloadInformations((''+Array(20)).split(',').map(function(){return this[0]++;}, [1]));
// commander.informations ? context.extractDownloadInformations(commander.pages) : context.downloadPages(commander.pages);

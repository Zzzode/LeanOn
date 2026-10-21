import { readFile, stat } from 'node:fs/promises';
import { planLegacyMigration } from '../dist/admin.js';

// Deliberately offline-only. There is no provider login, remote binding, or execute mode.
const argumentsList=process.argv.slice(2);
try {
  if(argumentsList.length!==9 || argumentsList[0]!=='--dry-run')throw new Error('Use --dry-run --source FILE --target ORIGIN --service-id VERIFIED_ID --operation ID');
  const options={};
  for(let index=1;index<argumentsList.length;index+=2) {
    const key=argumentsList[index];if(!['--source','--target','--service-id','--operation'].includes(key) || key in options)throw new Error('Invalid dry-run option');
    options[key]=argumentsList[index+1];
  }
  if((await stat(options['--source'])).size>16*1024*1024)throw new Error('Legacy input exceeds supported validation size');
  const state=JSON.parse(await readFile(options['--source'],'utf8'));
  process.stdout.write(JSON.stringify(planLegacyMigration(state,options['--target'],options['--service-id'],options['--operation']),null,2)+'\n');
}catch{process.stderr.write('Migration dry-run refused: check schema, supported size, explicit offline mode and verified target identity.\n');process.exitCode=1;}

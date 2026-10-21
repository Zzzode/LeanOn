import { runLocalAdminCli } from '../dist/local-admin.js';

const result = await runLocalAdminCli(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;

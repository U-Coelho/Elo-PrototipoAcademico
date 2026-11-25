import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const files = (await readdir('tests')).filter(file=>file.endsWith('.test.mjs')).sort().map(file=>`tests/${file}`);
const test = spawn(process.execPath,['--test',...files],{stdio:'inherit'});
test.on('exit',code=>{process.exitCode=code ?? 1;});

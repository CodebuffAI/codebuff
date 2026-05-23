#!/usr/bin/env node
import process from 'node:process';
import fs from 'node:fs';
import {imageDimensionsFromStream} from './index.js';

const stream = fs.createReadStream(process.argv[2]);
const {width, height} = await imageDimensionsFromStream(stream);

console.log(`${width}x${height}`);

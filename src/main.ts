import fs from "fs";
import path from "path";

import { ImagePool } from '@squoosh/lib';
import { cpus } from 'os';

const chalk = require('chalk');
const prettyBytes = require('pretty-bytes');

const CPUS_COUNT = cpus().length;

class Main 
{

    private static readonly IMAGE_POOL = new ImagePool(CPUS_COUNT);

    private static readonly ROOT_DIR = "/media/mohan/Portable SSD";
    private static readonly IMAGES_DIR = `${this.ROOT_DIR}/images`;
    private static readonly OUTPUT_DIR = `${this.ROOT_DIR}/output`;


    private static processedCount = 0;
    private static filePaths: string[] = [];

    private static readonly START_FROM = 0; //this is to resume in case of failure previously

    private static totalInputBytes  = 0;
    private static totalOutputBytes  = 0;

    public static async main() 
    {
        let maxFilesCount = 10000;
        this.addFilesRecurse(this.IMAGES_DIR, this.filePaths, path => {
            //select first file alone
            if(maxFilesCount-- <= 0) return false;

            if(path.endsWith(".jpg") || path.endsWith(".JPG")) {
                //fs.rmSync(path);  //comment or uncomment to delete for second time
                return true;
            }
            return false;
        });
        console.log(`poolsize:${chalk.blue(cpus().length)} files count:${this.filePaths.length}`);

        let activeImageMethods : Promise<void>[] = [];
        for(var i = this.START_FROM; i < this.filePaths.length; i++) {
            let filePath = this.filePaths[i]
            let currMethod = this.processFile(filePath, i, this.filePaths.length)
            activeImageMethods.push(currMethod);

            if(activeImageMethods.length > CPUS_COUNT * 2) {
                await this.joinMethods(activeImageMethods, CPUS_COUNT);
            }
        }
        
        //close remaining
        await this.joinMethods(activeImageMethods, activeImageMethods.length);

        this.IMAGE_POOL.close();
        console.log(`totalInputBytes:${chalk.green(prettyBytes(this.totalInputBytes))} totalOutputBytes:${chalk.green(prettyBytes(this.totalOutputBytes))}`)
    }

    private static async joinMethods(activeImageMethods : Promise<void>[], count: number) {
        let loopCount = Math.min(activeImageMethods.length, count);
        while(loopCount-- > 0) {
            await activeImageMethods.pop();
        }
    }

    private static async processFile(filePath: string, currFileId: number, totalFiles: number)
    {
        let relativePath = filePath.substring(this.IMAGES_DIR.length + 1);
        console.log(`reading [${currFileId}/${totalFiles}]: images/${chalk.blue(relativePath)}`);

        let imageData = fs.readFileSync(filePath);
        let image = this.IMAGE_POOL.ingestImage(imageData);
        const result = await image.encode({
            mozjpeg: {
                quality: 50
            }
        });
        console.log(`writing [${currFileId}/${totalFiles}]: output/${chalk.green(relativePath)} inputSize: ${chalk.green(prettyBytes(imageData.byteLength))} outputSize: ${chalk.green(prettyBytes(result.mozjpeg.binary.byteLength))}`);
        this.totalInputBytes += imageData.byteLength;
        this.totalOutputBytes += result.mozjpeg.binary.byteLength;

        let targetPath = `${this.OUTPUT_DIR}${path.sep}${relativePath}`;
        let targetFolder = targetPath.substring(0, targetPath.lastIndexOf(path.sep));
        fs.mkdirSync(targetFolder, {recursive: true});
        fs.writeFileSync(`${this.OUTPUT_DIR}${path.sep}${relativePath}`, result.mozjpeg.binary);
        
    }

    private static addFilesRecurse(folderPath: string, filePaths: string[], filter?: (path: string)=>boolean)
    {
        let files = fs.readdirSync(folderPath);
        files.forEach((name)=> {
            let filePath = `${folderPath}${path.sep}${name}`;
            if(fs.statSync(filePath).isDirectory()) {
                Main.addFilesRecurse(filePath, filePaths, filter);
            } else {
                if(!filter || filter(filePath)) {
                    filePaths.push(filePath);
                }
            }
        })
    }


}

if (require.main == module)
{
    Main.main()
}

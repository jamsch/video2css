const args = require('args');
const chalk = require('chalk');
const VideoToCSSParser = require('./parser');
const { log } = console;

args
  .option('seconds', 'Seconds', 5)
  .option('skipdecode', 'Skips video decoding', false)
  .option('file', 'File to use', undefined)
  .option('fps', 'Limit FPS of video to parse', 5)
  .option('width', 'Width of video', 340)
  .option('quality', 'Pixel width when using box shadows (1 = best)', 10)
  .option('base64', 'Uses base64 instead of box shadows', false)
  .option('output', 'Output Directory', './output');

const parsedArgs = args.parse(process.argv);
const {
  skipdecode,
  file,
  fps,
  width: videoWidth,
  seconds,
  quality,
  base64,
  output
} = parsedArgs;

if (!skipdecode && (!file || typeof file !== 'string')) {
  log(
    chalk.red(
      `No file selected. Syntax: "video2css.js --file=video.mp4 [options]. Type "video2css.js --help" for options.`
    )
  );
  return;
}

const Parser = new VideoToCSSParser(
  file,
  fps,
  skipdecode,
  videoWidth,
  seconds,
  quality,
  base64,
  output
);

Parser.start();

const Jimp = require('jimp');
const fs = require('fs');
const childProcess = require('child_process');
const chalk = require('chalk');
var CleanCSS = require('clean-css');

/**
 * Pads the number
 * @param {number} n
 * @param {number} width
 * @param {*} z
 */
function pad(n, width) {
  n = String(n);
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

/**
 * Creates a box-shadow representation of an image
 * @param {string} path File path
 */
async function getBoxShadowFromImage(path, quality) {
  const image = await Jimp.read(path);
  const { width, height } = image.bitmap;
  let boxShadow = '';
  for (let x = 0; x < width; x += quality) {
    for (let y = 0; y < height; y += quality) {
      const rgba = Jimp.intToRGBA(image.getPixelColor(x, y));
      boxShadow += `${x}px ${y}px rgb(${rgba.r}, ${rgba.g}, ${rgba.b}), `;
    }
  }

  return boxShadow.slice(0, -2);
}

/**
 * @param {string} path File path
 */
async function getImageDimensions(path) {
  const image = await Jimp.read(path);
  return image.bitmap;
}

class VideoToCSSParser {
  /**
   *
   * @param {string} file File name
   * @param {number} fps
   * @param {boolean} skipdecode
   * @param {number} videoWidth
   * @param {number} seconds
   * @param {number} quality
   * @param {number} base64
   * @param {string} output
   */
  constructor(
    file,
    fps,
    skipdecode,
    videoWidth,
    seconds,
    quality,
    useBase64,
    outputDir
  ) {
    this.file = file;

    this.fps = fps;
    this.seconds = seconds;
    this.quality = quality;
    this.useBase64 = useBase64;
    this.outputDir = outputDir;
    this.videoWidth = videoWidth;
    this.skipdecode = skipdecode;
  }

  get numFrames() {
    return this.fps * this.seconds;
  }

  start() {
    if (!this.skipdecode) {
      this.parseVideo();
    }

    this.parseImagesToFile();
  }

  parseVideo() {
    const { file, seconds, fps, videoWidth } = this;
    childProcess.execSync(
      `ffmpeg -i ${file} -t ${seconds} -r ${fps} -vf scale=${videoWidth}:-1 decoded/%03d.jpg`
    );
  }

  createBase64Generator() {
    const { numFrames } = this;
    return async function* yieldImageToBase64() {
      for (let i = 1; i < numFrames; i += 1) {
        const image = await Jimp.read(`decoded/${pad(i, 3)}.jpg`);
        const base64Data = image.getBase64Async(Jimp.MIME_JPEG);
        yield { base64Data, i };
      }
    };
  }

  async generateBase64CSS() {
    const base64Generator = this.createBase64Generator();

    let batchedCss = '';
    let batchedHtmlFrames = '';

    for await (const { base64Data, i } of base64Generator()) {
      batchedCss += `
            .frame-${i} {                
                width: ${this.width}px;
                height: ${this.height}px;
                background: url("${await base64Data}");
            }           
        `;
      batchedHtmlFrames += `<div class="frame-${i}"></div>`;
    }

    return { batchedCss, batchedHtmlFrames };
  }

  /**
   * Parses images to CSS and HTML
   */
  async parseImagesToFile() {
    console.log(chalk.green('Parsing image frames to CSS...'));
    const { width, height } = await getImageDimensions('decoded/001.jpg');

    this.width = width;
    this.height = height;

    let cssFrames;
    let htmlFrames;

    if (this.useBase64) {
      const { batchedCss, batchedHtmlFrames } = await this.generateBase64CSS();
      cssFrames = batchedCss;
      htmlFrames = batchedHtmlFrames;
    } else {
      const {
        batchedCss,
        batchedHtmlFrames
      } = await this.generateBoxShadowCSS();
      cssFrames = batchedCss;
      htmlFrames = batchedHtmlFrames;
    }

    const cssContents = `
        body {
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            height: ${height * 2}px;
            width: 100%;
            overflow: hidden;
        }
        @keyframes play {
            100% { transform: translateX(-${this.numFrames * width}px); }
        }
        .videoContainer {
            display: block;
            width: ${width}px;
            overflow: hidden;
            height: ${height}px;
        }
        .video {
            display: flex;
            width: ${width * this.numFrames}px;
            height: ${height}px;
            animation: play ${this.numFrames / this.fps}s steps(${
      this.numFrames
    }) infinite;
        }
        ${cssFrames}
  `;

    const htmlContent = `
    <html>
        <head>
            <link rel="stylesheet" href="video.css"/>
        </head>
        <body>
            <div class="videoContainer">
                <div class="video">
                   ${htmlFrames}
                </div>
            </div>
        </body>
    </html>
  `;

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir);
    }

    const minifiedCSS = new CleanCSS().minify(cssContents);

    fs.writeFile(`${this.outputDir}/video.css`, minifiedCSS.styles, err => {
      if (err) {
        console.log(chalk.red(err));
        return;
      }
      console.log(chalk.green('[CSS]: Saved!'));
    });

    fs.writeFile(`${this.outputDir}/index.html`, htmlContent, err => {
      if (err) {
        console.log(chalk.red(err));
        return;
      }
      console.log(chalk.green('[HTML]: Saved!'));
    });
  }

  createBoxShadowGenerator() {
    const { numFrames, quality } = this;
    return async function* yieldBoxShadowFromImage() {
      let zIndex = numFrames + 1;
      for (let i = 1; i < numFrames; i += 1) {
        const boxShadow = await getBoxShadowFromImage(
          `decoded/${pad(i, 3)}.jpg`,
          quality
        );
        yield { boxShadow, i, zIndex: zIndex-- };
      }
    };
  }

  async generateBoxShadowCSS() {
    const { width, height } = this;
    const boxShadowGenerator = this.createBoxShadowGenerator();

    let batchedCss = '';
    let batchedHtmlFrames = '';

    for await (const { boxShadow, i, zIndex } of boxShadowGenerator()) {
      batchedCss += `
            .frame-${i} {
                position: relative;
                width: ${width}px;
                height: ${height}px;
                top: -${height}px;
                left: -${width}px;
                box-shadow: ${boxShadow};
                z-index: ${zIndex};
            }
           
        `;
      batchedHtmlFrames += `<div class="frame-${i}"></div>`;
    }

    return { batchedCss, batchedHtmlFrames };
  }
}

module.exports = VideoToCSSParser;

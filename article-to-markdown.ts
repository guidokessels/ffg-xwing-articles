import puppeteer from "puppeteer";
import TurndownService from "turndown";
import fs from "fs";
import fetch from "node-fetch";

const turndownService = new TurndownService();

const LOG_ENABLED = true;
const PAGE =
  "https://www.fantasyflightgames.com/en/news/2020/10/7/push-the-limit/";
const SELECTOR = ".blog-detail";

const ELEMENTS_TO_REMOVE = [
  ".blog-social-icons",
  ".blog-footer",
  ".blog-hr",
  ".fb-like-button",
  ".blog-end",
  ".blog-back",
  ".forum-btn",
  "big",
  ".visible-desktop",
  ".meta-productline",
];

const run = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      // These are needed to make Puppeteer run on WSL1
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1920,
      height: 1080,
    });

    log(`Going to ${PAGE}`);
    await page.goto(PAGE);
    await page.waitForSelector(SELECTOR);

    log(`Removing unneeded elements and extracting HTML`);
    const contentHTML = await page.evaluate(
      (content, selectors) => {
        // Remove elements
        selectors.forEach((el) => {
          const node = document.querySelector(el);
          node.parentNode.removeChild(node);
        });

        // Check all text boxes and remove them if they're the `pre-order now` box
        const textBoxes = document.querySelectorAll(".textbox");
        Array.from(textBoxes).forEach((node) => {
          if (node.textContent.trim().startsWith("Pre-order your own copy")) {
            node.parentNode.removeChild(node);
          }
        });

        // Return article HTML
        return document.querySelector(content).innerHTML;
      },
      SELECTOR,
      ELEMENTS_TO_REMOVE
    );

    log(`Converting to Markdown`);
    const generatedMarkdown = turndownService.turndown(contentHTML);

    log(`Cleaning up Markdown`);
    let contentMarkdown = cleanupMarkdown(generatedMarkdown);

    const path = `markdown/${urlToFilename(PAGE)}`;

    if (!fs.existsSync(path)) {
      log(`Creating folder ${path}`);
      fs.mkdirSync(path);
    }

    const allImageUrls = Array.from(
      // Grabs all URLs from Markdown images or Markdown links that lead to images
      contentMarkdown.matchAll(/\[(?:.*?)\]\((.*?\.(?:png|jpe?g|gif))\)/gi)
    ).map(([_, url]) => url);

    log(`Downloading ${allImageUrls.length} article images`);
    allImageUrls.forEach((url) => {
      const filename = url.split("/").pop();
      saveImageToDisk(url, `${path}/${filename}`);
      contentMarkdown = contentMarkdown.replace(url, filename);
    });

    log(`Creating Markdown file`);
    await new Promise((resolve, reject) => {
      fs.writeFile(`${path}/index.md`, contentMarkdown, (err) => {
        if (err) {
          log(err);
          reject();
        }

        log("Page saved!");
        resolve(1); // ???
      });
    });

    log(`All done!`);
  } catch (e) {
    log(">>> ERROR <<<");
    log(e);
  }

  await browser.close();
};

run();

function log(...args) {
  if (LOG_ENABLED) {
    console.log(...args);
  }
}

function urlToFilename(str) {
  const [year, month, day, slug] = str
    .replace("https://www.fantasyflightgames.com/en/news/", "")
    .split("/");
  return [year, month, day].join("-") + "_" + slug;
}

function cleanupMarkdown(markdown) {
  // Remove all JavaScript for the image popups;
  return markdown.replace(/ \$\(document\)\.ready(.*)\}\);/g, "");
}

async function saveImageToDisk(url, filename) {
  log(`Saving image ${url} as ${filename}`);
  const res = await fetch(url);
  const dest = fs.createWriteStream(filename);
  // @ts-ignore
  res.body.pipe(dest);
}

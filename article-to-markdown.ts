import puppeteer from "puppeteer";
import TurndownService from "turndown";
import fs from "fs";
import fetch from "node-fetch";

const turndownService = new TurndownService();

const DIST_FOLDER = "./markdown";
const LOG_ENABLED = true;
const TITLE_SELECTOR = ".blog-titlelead h1";
const CONTENT_SELECTOR = ".blog-detail";
const ARTICLES_FILENAME = "./articles.json";

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
  let articleURLs: Array<string> = [];
  const allArticles: Array<{
    title: string;
    file: string;
    date: string;
  }> = [];

  try {
    // articleURLs = JSON.parse(
    //   await fs.promises.readFile(ARTICLES_FILENAME, { encoding: "utf-8" })
    // );
  } catch (e) {
    log(">>> ERROR <<<");
    log(e);
    log(`Make sure ${ARTICLES_FILENAME} exists by running 'yarn articles'`);
    return;
  }

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

    log(`Found ${articleURLs.length} articles`);

    await articleURLs.reduce(async (aq, url) => {
      await aq;

      log(`Opening ${url}`);
      await page.goto(url);
      await page.waitForSelector(CONTENT_SELECTOR);

      log(`\tRemoving unneeded elements and extracting HTML`);
      const [articleTitle, contentHTML] = await page.evaluate(
        (title, content, selectors) => {
          // Remove elements
          selectors.forEach((el) => {
            const node = document.querySelector(el);
            if (node) {
              node.parentNode.removeChild(node);
            }
          });

          // Check all text boxes and remove them if they're the `pre-order now` box
          const textBoxes = document.querySelectorAll(".textbox");
          Array.from(textBoxes).forEach((node) => {
            const content = node.textContent.toLowerCase();
            if (
              content.includes("ffg_ordernow_v2.png") ||
              content.includes("order your own copy")
            ) {
              node.parentNode.removeChild(node);
            }
          });

          // Return article HTML
          return [
            document.querySelector(title).innerText,
            document.querySelector(content).innerHTML,
          ];
        },
        TITLE_SELECTOR,
        CONTENT_SELECTOR,
        ELEMENTS_TO_REMOVE
      );

      log(`\tConverting to Markdown`);
      const generatedMarkdown = createArticle(url, contentHTML);

      log(`\tCleaning up Markdown`);
      let contentMarkdown = cleanupMarkdown(generatedMarkdown);

      const folder = urlToFilename(url);
      const path = `${DIST_FOLDER}/${folder}`;

      if (!fs.existsSync(path)) {
        log(`\tCreating folder at ${path}`);
        fs.mkdirSync(path, { recursive: true });
      }

      const allImageUrls = Array.from(
        // Find all:
        //    Markdown image urls
        //    Markdown link urls that lead to images
        contentMarkdown.matchAll(/\(([^\]]*?\.(?:png|jpe?g|gif))\)/gi)
      ).map(([_, url]) => url);

      log(`\tDownloading ${allImageUrls.length} article images`);
      await Promise.all(
        allImageUrls.map(async (imageUrl) => {
          const filename = imageUrl.split("/").pop();
          contentMarkdown = contentMarkdown.replace(imageUrl, filename);
          await saveImageToDisk(imageUrl, `${path}/${filename}`);
        })
      );

      log(`\tSaving Markdown file`);
      const filename = `index.md`;
      await saveFile(`${path}/${filename}`, contentMarkdown);

      const { year, month, day } = getArticleMetadataFromUrl(url);
      allArticles.push({
        title: articleTitle,
        file: `${folder}/${filename}`,
        date: [year, month, day].join("-"),
      });

      log("\tDone");
    }, Promise.resolve());

    log(`Creating index`);
    const indexFile = createIndex(allArticles);
    await saveFile(`${DIST_FOLDER}/index.md`, indexFile);

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

function getArticleMetadataFromUrl(
  url
): { year: number; month: number; day: number; slug: string } {
  const [year, month, day, slug] = url
    .replace("https://www.fantasyflightgames.com/en/news/", "")
    .split("/");
  return {
    year,
    month: month.length === 1 ? `0${month}` : month,
    day: day.length === 1 ? `0${day}` : day,
    slug,
  };
}

function urlToFilename(str) {
  const { year, month, day, slug } = getArticleMetadataFromUrl(str);
  return [year, month, day].join("-") + "_" + slug;
}

function cleanupMarkdown(markdown) {
  // Remove all JavaScript for the image popups;
  return markdown.replace(/ \$\(document\)\.ready(.*)\}\);/g, "");
}

async function saveImageToDisk(url, filename) {
  // log(`Saving image ${url} as ${filename}`);
  try {
    const res = await fetch(url);
    const dest = fs.createWriteStream(filename);
    // @ts-ignore
    res.body.pipe(dest);
  } catch (e) {
    log(">>> ERROR <<<");
    log(`Could not download "${url}" to "${filename}"`);
    log(e);
  }
}

function createIndex(
  articles: Array<{
    title: string;
    file: string;
    date: string;
  }>
) {
  return `
# FFG X-Wing Articles Archive

${articles
  // @ts-ignore
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .map((article) => `- [${article.title}](${article.file}) (${article.date})`)
  .join(`\n`)}
`;
}

async function saveFile(path, contents) {
  return await new Promise<void>((resolve, reject) => {
    fs.writeFile(path, contents, (err) => {
      if (err) {
        log(">>> ERROR Saving file <<<");
        log(err);
        reject();
      }
      resolve();
    });
  });
}

function createArticle(url: string, content: string): string {
  return (
    `This article was originally published on ${url}

&laquo; [Back to index](../index.md)

---

` + turndownService.turndown(content)
  );
}

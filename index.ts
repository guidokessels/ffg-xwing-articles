import puppeteer from "puppeteer";

const LOG_ENABLED = true;
const PAGE =
  "https://www.fantasyflightgames.com/en/news/2020/10/7/push-the-limit/";
const SELECTOR = ".blog-detail";

const COOKIE_BANNER_SELECTOR = "#iubenda-cs-banner";
const TOP_BAR_SELECTOR = "#fixed-at-top";
const CONTENT_ELEMENTS_SELECTORS = [
  ".blog-social-icons",
  ".blog-footer",
  ".blog-hr",
  ".fb-like-button",
  ".blog-end",
  ".blog-back",
  ".forum-btn",
];

const ELEMENTS_TO_REMOVE = [
  COOKIE_BANNER_SELECTOR,
  TOP_BAR_SELECTOR,
  ...CONTENT_ELEMENTS_SELECTORS,
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

    await page.waitForSelector(SELECTOR); // wait for the selector to load
    await page.waitForSelector(COOKIE_BANNER_SELECTOR); // wait for the selector to load
    const element = await page.$(SELECTOR); // declare a variable with an ElementHandle

    // Add some padding
    await page.addStyleTag({ content: `${SELECTOR}{padding: 10px}` });

    log(`Removing unneeded elements`);
    await page.evaluate((selectors) => {
      selectors.forEach((el) => {
        const node = document.querySelector(el);
        node.parentNode.removeChild(node);
      });
    }, ELEMENTS_TO_REMOVE);

    const filename = urlToFilename(PAGE);

    log(`Creating screenshot: ${filename}`);
    await element.screenshot({ path: `${filename}.png` });

    log(`All done!`);
  } catch (e) {
    console.log(">>> ERROR <<<");
    console.log(e);
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

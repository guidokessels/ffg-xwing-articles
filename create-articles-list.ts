import fs from "fs";
import fetch from "node-fetch";

const ARTICLES_FILE_NAME = `articles.json`;

const getArticleUrls = async () => {
  const articleURLs = new Set();
  const response = await fetch(
    "https://xhud.sirjorj.com/xwing.cgi/releases2?format=json"
  );
  const json = await response.json();

  json.forEach(({ articles = {} }) => {
    Object.values(articles).forEach((d) => {
      if (Array.isArray(d)) {
        d.forEach((a) => articleURLs.add(a));
      } else {
        articleURLs.add(d);
      }
    });
  });

  return [...articleURLs].sort();
};

const run = async () => {
  const urls = await getArticleUrls();
  fs.writeFileSync(ARTICLES_FILE_NAME, JSON.stringify(urls, null, 2));
  console.log(`Saved ${urls.length} article URLs to ${ARTICLES_FILE_NAME}.`);
};

run();

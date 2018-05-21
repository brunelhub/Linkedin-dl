#!/usr/bin/env node

const util = require('util');
const fs = require('fs');
const puppeteer = require('puppeteer');
const request = require('request');
const progress = require('request-progress');
const progressBar = require('progress');
const colors = require('colors');

/*
TODO
- check that data is not undefined before creating folder and iterating
- remove ? from the titles => error downloading files
- remove the promise part from dataListener
- don't send '.mp4' to downloadVideo. Use 'content-type' instead
- promisify the login process instead of waiting 2 secs
- optimize puppeteer (don't download images, styles, etc)
*/

function getParam(flag) {
  let flagIndex = process.argv.indexOf(flag);
  return flagIndex === -1 ? null : process.argv[flagIndex+1];
}

function checkParam(url) {
  if (url == null) {
    console.log('invalid url : ' + url);
    process.exit(0);
  }
}

function printHeader() {
  console.log('====================================================================='.green);
  console.log('###########################  Linkedin-dl  ###########################'.green);
  console.log('=====================================================================\n'.green);
}

function preventDetection (page) {

  // Pass the User-Agent Test.
  const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
  page.setUserAgent(userAgent);

  // Pass the Webdriver Test.
  page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  // Pass the Chrome Test.
  page.evaluateOnNewDocument(() => {
    // We can mock this in as much depth as we need for the test.
    window.navigator.chrome = {
      runtime: {},
      // etc.
    };
  });

  // Pass the Permissions Test.
  page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    return window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  // Pass the Plugins Length Test.
  page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for the current test,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5],
    });
  });

  // Pass the Languages Test.
  page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  page.setExtraHTTPHeaders({
    'Access-Control-Allow-Origin': '*'
  });
}

function getCourseData(result) {

  let detailedCourses = {};
  // In the array "included" 
  for (var i = 0; i < result.included.length; i += 1) {
    if (result.included[i].courseType) {
      // Get the course title
      detailedCourses.courseTitle = result.included[i].title;
      detailedCourses.chapters = [];

      // Get the list of the chapters
      let chapters = result.included[i].chapters;
      let videoCount = 0;
      chapters.forEach(function (chapter, index) {
        // For each chapter, get the corresponding chapter in the chapters object
        for (var j = 0; j < result.included.length; j += 1) {
          if (result.included[j].$id === chapter) {
            let chapterTitle = (index + 1) + ' - ' + result.included[j].title;

            detailedCourses.chapters[index] = {};
            detailedCourses.chapters[index]['chapterTitle'] = chapterTitle;
            detailedCourses.chapters[index].videos = [];

            // Get the list of the videos
            let videos = result.included[j].videos;
            videos.forEach(function (video, index2) {
              videoCount += 1;
              // For each video, get the corresponding video in the videos object
              for (var k = 0; k < result.included.length; k += 1) {
                if (result.included[k].$id === video) {
                  let videoTitle = videoCount + ' - ' + result.included[k].title;
                  let videoSlug = result.included[k].slug;
                  let videoUrl = url + '/' + videoSlug;

                  detailedCourses.chapters[index].videos[index2] = {};
                  detailedCourses.chapters[index].videos[index2]['title'] = videoTitle;
                  detailedCourses.chapters[index].videos[index2]['slug'] = videoSlug;
                  detailedCourses.chapters[index].videos[index2]['url'] = videoUrl;
                }
              }
            })
          }
        }
      })
    }
  }
  return detailedCourses;
}

function sanitizeName(name) {
  name = name.replace(/[/\\?%*:|"<>]/g, '');
  return name;
}

function createFolder(path) {
  return new Promise(function (resolve, reject) {

    fs.access(path, (err) => {
      if (err) {
        fs.mkdir(path, function () {
          // console.log('folder created'.green);
          resolve(path);
        });
      } else {
        // console.log('folder already exists'.yellow);
        resolve(path);
      }
    });

  });
}

function selectHD(page) {
  return new Promise(function (resolve, reject) {

    // console.log('select HD'.green);
    // page.click() won't work because the button is not accessible to mouse click
    page.evaluate(() => {
      let hdButton = 'ul.stream-qualities > li:last-child > button';
      $(hdButton).click();
    });
    resolve(true);

  });
}

function downloadVideo(path, url) {
  return new Promise(function (resolve, reject) {

    let bar;
    progress(request(url))
      // .on('request', function (req) {

      // })
      .on('response', function (response) {

        const contentLength = parseInt(response.headers['content-length'], 10);
        bar = new progressBar('      [:bar] :percent'.green, {
          complete: '>', 
          incomplete: '-', 
          width: 50, 
          total: contentLength,
          clear: true
        });

      })
      .on('progress', function (state) {

        bar.update(state.percent);

      })
      .on('error', function (err) {

        console.log(`      Error downloading\n`.red);
        reject();

      })
      .on('end', function () {

        bar.update(1);
        // bar.terminate();
        console.log(`      ==> downloaded\n`.green);
        resolve();

      })
      .pipe(fs.createWriteStream(path));

  });
}


//node index -u course-url
const baseUrl = 'https://www.linkedin.com/learning/';
const loginUrl = 'https://www.linkedin.com/uas/login?fromSignIn=true&trk=learning&_l=fr_FR&uno_session_redirect=%2Flearning%2F&session_redirect=%2Flearning%2FloginRedirect.html';
const user = getParam('-u');
const pass = getParam('-p');
const slug = getParam('-s');
const url = baseUrl + slug;

checkParam(slug);
printHeader();

// Start browsing
(async () => {
  
  const args = [
    '--no-sandbox',
    '--disable-infobars',
  ];
  const options = {
    args,
    // headless: false,
    // devtools: true,
    //executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome' // <-- chrome path here
  };
  const browser = await puppeteer.launch(options);
  const pages = await browser.pages();
  const page = pages[0]; // use the blank tab as our page
  

  console.log('* Log in...');
  await page.goto(loginUrl, { waitUntil: 'load', timeout: 0 });
  await page.type('#session_key-login', user);
  await page.type('#session_password-login', pass);
  await page.click('#btn-primary');
  await page.waitFor(2000);  // Wait for login
  console.log('==> OK\n'.green);


  // Preparing the page to prevent detection 
  console.log('* Configure the browser...');
  await preventDetection(page);
  console.log('==> OK\n'.green);


  // Create a listener to collect course data
  let data = {};
  const dataListener = new Promise((resolve, reject) => {
    function handleResponse(response) {

      if (response.url().endsWith('slugs')) {
        response.json().then(
          function (value) {
            data = getCourseData(value);
            // Remove the listener
            page.removeListener('response', handleResponse);
            resolve();
          }
        )
      }
    }
    page.on('response', handleResponse);
  });


  // Go to course page
  console.log('* Collect course data...');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 0});
  // await page.waitFor(2000);
  
  if (data.courseTitle == undefined) {
    console.log('==> something went wrong while collecting data'.red);
    process.exit(0);
  }else {
    console.log('==> OK\n'.green);
    // fs.writeFile('detailedCourses.json', JSON.stringify(courseData), 'utf8');
  }

  console.log('[ ' + data.courseTitle + ' ]\n');
  // create course folder
  await createFolder('./Linkedin - ' + sanitizeName(data.courseTitle));


  // iterate through each chapter of the course
  for (let chapter of data.chapters) {

    console.log('  ' + chapter.chapterTitle);
    // create chapter folder
    let path = './Linkedin - ' + sanitizeName(data.courseTitle) + '/' + sanitizeName(chapter.chapterTitle);
    await createFolder(path);


    // iterate through each video of the chapter
    for (let video of chapter.videos) {

      console.log('      ' + video.title);
      let url = video.url;
      let videoPath = path + '/' + sanitizeName(video.title) + '.mp4';

      // Check if video already exists
      const checkFolder = await new Promise((resolve, reject) => {

        fs.access(videoPath, async(err) => {
          if (err) {

            // Go to video page
            await page.setRequestInterception(false);
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });

            // Create a listener to retrieve video url from the request
            const videoSrc = await new Promise((resolve, reject) => {
              function handleRequest(request) {

                if (request.resourceType() == 'media') {
                  let src = request.url();

                  // Remove the listener
                  // If goto is called with setRequestInterception set to true but no listener defined for 'request', the app freezes (unresolved promise somewhere ?)
                  page.removeListener('request', handleRequest);
                  request.continue();
                  resolve(src);
                }
                else {
                  request.continue();
                }
              }
              page.setRequestInterception(true);
              page.on('request', handleRequest);
              selectHD(page); // sends the request
            });
            // await console.log(`videoSrc = ${videoSrc}`.green);

            // Downloading the video
            await downloadVideo(videoPath, videoSrc);
            resolve();

          } else {
            await console.log('      ==> video found\n'.grey);
            resolve();
          }
        });
      });

    }
  }
  console.log('\nDone downloading "' + data.courseTitle+ '"\n');

  await browser.close()

})();
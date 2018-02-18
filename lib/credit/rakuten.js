const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');

class rakuten {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    const cookieJar = request.jar();
    Object.defineProperties(this, {
      '_cookieJar': {
        value: cookieJar
      },
      '_request': {
        value: request.defaults({
          simple: false,
          resolveWithFullResponse: true,
          headers: {
            'User-Agent': `Mozilla/5.0 SMBC/1.0`
          },
          jar: cookieJar
        })
      },
      '_iconv': {
        value: new Iconv('SHIFT_JIS','UTF-8//TRANSLIT//IGNORE')
      }
    });
  }

  async waitInit () {}

  async login () {
    let URL, HTML, postData, headers;
    URL = "https://www.rakuten-card.co.jp/e-navi/";
    HTML = (await this._request.get(URL)).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').eq(0).serialize()),
      {
        u: this.id,
        p: this.password
      }
    );
    URL = "https://grp01.id.rakuten.co.jp/rms/nid/login?"
    headers = (await this._request.post(URL, {form: postData})).headers;
    await this._request.get(headers['location']);
  }

  async getDetails(year, month){
    let URL, HTML, $, queryData;
    //go to details page
    URL = "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?tabNo=0"
    HTML = (await this._request.get(URL)).body;
    $ = cheerio.load(HTML);
    const latestY = parseInt(
      $('.tableStyle01 tbody').eq(0)
        .children().eq(3).text()
        .replace(/請求確定日|\s/g,"").replace(/\/.*$/g,""),
      10);
    const latestM = parseInt(
      $('.tableStyle01 tbody').eq(0)
        .children().eq(3).text()
        .replace(/請求確定日|\s/g,"").replace(/^.*?\/|\/.*?$/g,""),
      10);
    const diff = (year - latestY) * 12 + (month - latestM) + 1;
    const checkPages = [];
    if (diff === 0 || diff === 1) {
      checkPages.push(0);
    } else if (diff < 0 && diff > -15) {
      checkPages.push(-1 * diff -1);
      checkPages.push(-1 * diff);
    } else if (diff === -15) {
      checkPages.push(14);
    } else {
      throw {message: "No Data"};
    }
    const output = [];
    for (let checkPage of checkPages) {
      URL = "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml?tabNo="+checkPage;
      HTML = (await this._request.get(URL)).body;
      $ = cheerio.load(HTML);
      //create data
      if (checkPage) {
        $('#pastSortForm\\:listPast tbody').children().each(function(){
          const columns = $(this).children();
          const date = columns.eq(0).text();
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(4).text().replace(/,/g, ""), 10),
              detail: columns.eq(1).text().replace(/ *$/g, "")
            });
          }
        });
      } else {
        $('#nextLatestSortForm\\:nextListLatest tbody').children().each(function(){
          const columns = $(this).children();
          const date = columns.eq(0).text();
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(3).text().replace(/,/g, ""), 10),
              detail: columns.eq(1).text().replace(/ *$/g, "")
            });
          }
        });
        $('#latestSortForm\\:listLatest tbody').children().each(function(){
          const columns = $(this).children();
          const date = columns.eq(0).text();
          if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
              === month) {
            output.push({
              date: date,
              price: -1 * parseInt(columns.eq(3).text().replace(/,/g, ""), 10),
              detail: columns.eq(1).text().replace(/\n/g, "").replace(/ *$/g, "")
            });
          }
        });
      }
    }
    return output.reverse();
  }
}

module.exports  = rakuten;

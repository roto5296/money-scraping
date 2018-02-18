const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');

class pocket {
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
            'Accept': `text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8`,
            'Accept-Encoding': `gzip, deflate, sdch, br`,
            'Accept-Language': `ja,en-US;q=0.8,en;q=0.6,es;q=0.4,pt;q=0.2`,
            'Upgrade-Insecure-Requests': 1,
            'Connection': `keep-alive`,
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36`
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
    URL = "https://wis.pocketcard.co.jp/netservice/login?type=ft";
    HTML = (await this._request.get(URL)).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        username: this.id,
        password: this.password,
        imgCertf: 1
      }
    );
    URL = "https://wis.pocketcard.co.jp/netservice/authentication";
    headers = (await this._request.post(URL, {form: postData})).headers;
    await this._request.get(headers['location']);
  }

  async getDetails(year, month){
    let URL, HTML, $, postData;
    //go to details page
    URL = "https://wis.pocketcard.co.jp/netservice/webDetailsReference"
    HTML = (await this._request.get(URL)).body;
    $ = cheerio.load(HTML);
    const latestY = parseInt(
      $('.twoColumnsType1 .table-cell').eq(0)
        .text().replace(/\s/g,"").replace(/年.*$/g, ""),
      10);
    const latestM = parseInt(
      $('.twoColumnsType1 .table-cell').eq(0)
        .text().replace(/\s/g,"").replace(/^.*年|月.*$/g, ""),
      10);
    //go to details page
    if (year*12+month > latestY*12+latestM-2) {
      URL = "https://wis.pocketcard.co.jp/netservice/lastDetailsReference";
      HTML = (await this._request.get(URL)).body;
    } else {
      URL = "https://wis.pocketcard.co.jp/netservice/webDetailsReference/change";
      postData = Object.assign(
        qs.parse(cheerio.load(HTML)('form').eq(1).serialize()),
        {
          optClmDtYm: year + ('0'+(month+2)).slice(-2)
        }
      );
      HTML = (await this._request.post(URL, {form: postData})).body;
    }
    $ = cheerio.load(HTML);
    //create data
    const output = [];
    $('.generalTableType1 tbody').children().slice(0, -1).each(function(){
      const columns = $(this).children();
      const date = columns.eq(0).text().replace(/\s/g, "");
      if (parseInt(date.replace(/^.*?\/|\/.*?$/g, ""), 10)
          === month
          && parseInt(date.replace(/\/.*$/g, ""), 10)
          === year) {
        output.push({
          date: date,
          price: -1 * parseInt(columns.eq(2).text().replace(/\s|,/g, ""), 10),
          detail: columns.eq(1).text().replace(/\s/g, "")
        });
      }
    });
    return output;
  }
}

module.exports  = pocket;

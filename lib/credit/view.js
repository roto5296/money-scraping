const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');

class view {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    this._sv = null;
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

  async login () {
    let URL, HTML, postData, headers, hoge;
    await this._request.get("http://www.jreast.co.jp/card/index.html");
    await this._request.get("https://viewsnet.jp/default.htODm");
    URL = "https://viewsnet.jp/V0100/V0100_001.aspx";
    postData = {
      id: this.id,
      pass: this.password,
      x: 200,
      y: 20
    };
    headers = (await this._request.post(URL, {form: postData})).headers;
    URL = "https://viewsnet.jp" + headers['location'];
    this._sv = URL.substr(-3);
    await this._request.get(URL, {encoding: null});
  }

  async getDetails(year, month){
    let HTML, $, URL, postData, headers;
    //go to detail page
    URL = "https://viewsnet.jp/V0300/V0300_001.aspx?sv="+this._sv;
    HTML = (await this._request.get(URL, {encoding: null})).body;
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    const latestY = parseInt($('#decision a').text().replace(/年.*$/g,''), 10);
    const latestM = parseInt($('#decision a').text().replace(/^.*年|月/g,''), 10);
    const diff = (year - latestY) * 12 + (month - latestM) + 1;
    const output = [];
    //go to detail page and create data
    if (diff === 0 || diff === 1) {
      postData = Object.assign(
        qs.parse(cheerio.load(this._iconv.convert(HTML).toString())('form').serialize()),
        {
          __EVENTTARGET: "LnkYotei",
          __EVENTARGUMENT: ""
        }
      );
      headers = (await this._request.post(URL, {form: postData})).headers;
      URL = "https://viewsnet.jp" + headers['location'];
      HTML = (await this._request.get(URL, {encoding: null})).body;
      $ = cheerio.load(this._iconv.convert(HTML).toString());
      $('#DivDetailInfo tbody').children().slice(2).each(function(){
        const columns = $(this).children();
        if (parseInt(
          columns.eq(0).children().eq(2).text().replace(/\/.*$/g,"")
          , 10) === month) {
          output.push({
            date: columns.eq(0).children().eq(0).text() + '/'
              + columns.eq(0).children().eq(2).text(),
            price: -1 * parseInt(
              columns.eq(3).children().eq(0).text().replace(/,/g,'')
              , 10),
            detail: columns.eq(2).text().replace(/\r|\n|\t/g,'').replace(/^ *| *$/g,'')
          });
        }
      });
    } else if (diff < -12 || diff > 1) {
      throw {message: "No Data"};
    } else {
      postData = Object.assign(
        qs.parse(cheerio.load(this._iconv.convert(HTML).toString())('form').serialize()),
        {
          __EVENTTARGET: "LnkClaimYm" + (-1 * diff),
          __EVENTARGUMENT: ""
        }
      );
      headers = (await this._request.post(URL, {form: postData})).headers;
      URL = "https://viewsnet.jp" + headers['location'];
      HTML = (await this._request.get(URL, {encoding: null})).body;
      $ = cheerio.load(this._iconv.convert(HTML).toString());
      $('#DivDetailInfo tbody').children().slice(3, -1).each(function(){
        const columns = $(this).children();
        output.push({
          date: columns.eq(0).children().eq(0).text() + '/'
            + columns.eq(0).children().eq(2).text(),
          price: -1 * parseInt(
            columns.eq(3).text().replace(/\s|,/g,'')
            , 10),
          detail: columns.eq(2).text().replace(/\r|\n|\t/g,'').replace(/^ *| *$/g,'')
        });
      });
    }
    return output;
  }
}

module.exports  = view;

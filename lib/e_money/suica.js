const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');
const fileCookieStore = require('tough-cookie-filestore');

class suica {
  constructor ({ id, password, options }) {
    this.id = id;
    this.password = password;
    this.options = options || {};
    const cookieJar = request.jar(new fileCookieStore(this.options.cookie || process.env.SUICA_COOKIE));
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

  async login (imageString, form) {
    let URL, HTML, statusCode, formData, headers, $;
    let needImageString = false;
    //画像認証
    if (imageString && form) {
      formData = Object.assign(
        form,
        {
          "ctl00$MainContent$upImageStringsTextBox": imageString,
          "ctl00$MainContent$passwordTextBox": this.password,
          "ctl00$MainContent$term": "okRadioButton",
          "ctl00$MainContent$nextButton.x": 27,
          "ctl00$MainContent$nextButton.y": 69,
        }
      );
      URL = "https://my.jreast.co.jp/web/au/RiskbaseForm.aspx";
      ({body: HTML, statusCode: statusCode} = await this._request.post(URL, {form: formData}));
      if (statusCode == 302) {
        //画像認証成功
        URL = "https://my.jreast.co.jp/web/au/OutsideLoginForm.aspx";
        HTML = await this._request.get(URL).body;
        URL = "https://www.mobilesuica.com/ka/so/AuthAndGetScreen.aspx";
        formData = qs.parse(cheerio.load(HTML)('form').serialize());
        HTML = await this._request.post(URL, {form: formData, encoding: null}).body;
      } else {
        needImageString = true;
      }
    } else {
      URL = "https://www.mobilesuica.com/";
      HTML = await this._request.get(URL, {encoding: null}).body;
      //timeout対策
      ({body: HTML, statusCode: statusCode, headers: headers} = await this._request.get(URL, {encoding: null, followRedirect: false}));
      if (statusCode === 302 && headers['location'] === '/cm/lb/ServiceOvertime.html') {
        throw {message: 'Out of Service'};
      }
      $ = cheerio.load(this._iconv.convert(HTML).toString());
      //ログイン済ならpostの必要なし
      if ($('title').text() === "JR東日本：モバイルSuica＞ログイン") {
        formData = Object.assign(
          qs.parse($('form').eq(2).serialize()),
          {
            CommonID: this.id,
            Password: this.password
          }
        );
        URL = "https://my.jreast.co.jp/web/au/OutsideLoginForm.aspx";
        ({body: HTML, statusCode: statusCode} = await this._request.post(URL, {form: formData}));
        if (statusCode == 302) {
          //要画像認証
          URL = "https://my.jreast.co.jp/web/au/RiskbaseForm.aspx"
          HTML = await this._request.get(URL).body;
          needImageString = true;
        } else {
          URL = "https://www.mobilesuica.com/ka/so/AuthAndGetScreen.aspx";
          formData = qs.parse(cheerio.load(HTML)('form').serialize());
          HTML = await this._request.post(URL, {form: formData, encoding: null}).body;
        }
      }
    }
    if (needImageString) {
      $ = cheerio.load(HTML);
      const {body: img} = await this._request.get("https://my.jreast.co.jp/web/au/"+$('.igc_CaptchaImage').attr('src'), {encoding: null});
      formData = qs.parse($('form').serialize());
      throw {message: "Need Image Authorization", img: img, form: formData};
    }
  }

  async getDetails(year, month){
    let URL, HTML, statusCode, formData, headers, $;
    //Go to TopPage
    URL = "https://www.mobilesuica.com/"
    ({body: HTML, statusCode: statusCode, headers: headers} = await this._request.get(URL, {encoding: null, followRedirect: false}));
    if (statusCode === 302 && headers['location'] === '/cm/lb/ServiceOvertime.html') {
      throw {message: 'Out of Service'};
    }
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    //go to details page
    URL = $('#area2 .btn a').eq(0).attr('href').match(/'.*'/g)[0].slice(1, -1);
    HTML = await this._request.post(URL, {encoding: null}).body;
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    //make form data
    const lastDay = new Date();
    if (lastDay.getYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    formData = Object.assign(
      qs.parse($('form').serialize()),
      {
        SEARCH: "検索",
        specifyYearMonth: year+'/'+('0'+month).slice(-2),
        specifyDay: ('0'+lastDay.getDate()).slice(-2)
      }
    );
    //go to details page
    URL = "https://www.mobilesuica.com/iq/ir/SuicaDisp.aspx";
    HTML = await this._request.post(URL, {form: formData, encoding: null}).body;
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    //create data
    let output = [];
    if ($('.grybg01 tbody').length) {
      const $2 = $('.grybg01 tbody').eq(1).children().slice(1, -1);
      for (let i = 0; i < $2.length; i++) {
        const columns = $2.eq(i).children();
        let lastMonth = month - 1;
        if (!lastMonth) {
          let lastMonth = 12;
        }
        //対象月以外は無視
        if (columns.eq(0).text().slice(0, 2) === ('0'+lastMonth).slice(-2)) {
          break;
        }
        output.push({
          date: year+'/'+columns.eq(0).text(),
          price: parseInt(columns.eq(6).text().replace(/,|\+/g, ""), 10),
          detail: (
            columns.eq(1).text()
              + ' ' + columns.eq(2).text().replace(/　+$/g,"")
              + ' ' + columns.eq(3).text().replace(/　+$/g,"")
              + ' ' + columns.eq(4).text().replace(/　+$/g,"")
          ).replace(/ +$/g,"")
        });
      }
      output.reverse();
      return output;
    } else {
      throw {message: "No Data"};
    }
  }
}

module.exports  = suica;

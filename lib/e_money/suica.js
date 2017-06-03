var request = require('request-promise');
var qs = require('querystring');
var cheerio = require('cheerio');
var jschardet = require('jschardet');
var Iconv = require('iconv').Iconv;
var url = require('url');
var fileCookieStore = require('tough-cookie-filestore');
var fs = require('fs');

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
    var needImageString = false;
    //画像認証
    if (imageString && form) {
      var formData = Object.assign(
        form,
        {
          "ctl00$MainContent$upImageStringsTextBox": imageString,
          "ctl00$MainContent$passwordTextBox": this.password,
          "ctl00$MainContent$term": "okRadioButton",
          "ctl00$MainContent$nextButton.x": 27,
          "ctl00$MainContent$nextButton.y": 69,
        }
      );
      var URL = "https://my.jreast.co.jp/web/au/RiskbaseForm.aspx";
      var {body: HTML, statusCode: statusCode} = await this._request.post(URL, {form: formData});
      if (statusCode == 302) {
        //画像認証成功
        var URL = "https://my.jreast.co.jp/web/au/OutsideLoginForm.aspx";
        var {body: HTML} = await this._request.get(URL);
        var URL = "https://www.mobilesuica.com/ka/so/AuthAndGetScreen.aspx";
        var formData = qs.parse(cheerio.load(HTML)('form').serialize());
        var {body: HTML} = await this._request.post(URL, {form: formData, encoding: null});
      } else {
        needImageString = true;
      }
    } else {
      var URL = "https://www.mobilesuica.com/";
      var {body: HTML} = await this._request.get(URL, {encoding: null});
      //timeout対策
      var {body: HTML} = await this._request.get(URL, {encoding: null});
      var $ = cheerio.load(this._iconv.convert(HTML).toString());
      //ログイン済ならpostの必要なし
      if ($('title').text() === "JR東日本：モバイルSuica＞ログイン") {
        var formData = Object.assign(
          qs.parse($('form').eq(2).serialize()),
          {
            CommonID: this.id,
            Password: this.password
          }
        );
        var URL = "https://my.jreast.co.jp/web/au/OutsideLoginForm.aspx";
        var {body: HTML, statusCode: statusCode} = await this._request.post(URL, {form: formData});
        if (statusCode == 302) {
          //要画像認証
          var URL = "https://my.jreast.co.jp/web/au/RiskbaseForm.aspx"
          var {body: HTML} = await this._request.get(URL);
          needImageString = true;
        } else {
          var URL = "https://www.mobilesuica.com/ka/so/AuthAndGetScreen.aspx";
          var formData = qs.parse(cheerio.load(HTML)('form').serialize());
          var {body: HTML} = await this._request.post(URL, {form: formData, encoding: null});
        }
      }
    }
    if (needImageString) {
      var $ = cheerio.load(HTML);
      var {body: img} = await this._request.get("https://my.jreast.co.jp/web/au/"+$('.igc_CaptchaImage').attr('src'), {encoding: null});
      var formData = qs.parse($('form').serialize());
      return {img: img, form: formData};
    }
  }

  async getDetails(year, month){
    //Go to TopPage
    var URL = "https://www.mobilesuica.com/"
    var {body: HTML} = await this._request.get(URL, {encoding: null});
    var $ = cheerio.load(this._iconv.convert(HTML).toString());
    //go to details page
    var URL = $('#area2 .btn a').eq(0).attr('href').match(/'.*'/g)[0].slice(1, -1);
    var {body: HTML} = await this._request.post(URL, {encoding: null});
    var $ = cheerio.load(this._iconv.convert(HTML).toString());
    //make form data
    var lastDay = new Date();
    if (lastDay.getYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    var formData = Object.assign(
      qs.parse($('form').serialize()),
      {
        SEARCH: "検索",
        specifyYearMonth: year+'/'+('0'+month).slice(-2),
        specifyDay: ('0'+lastDay.getDate()).slice(-2)
      }
    );
    //go to details page
    var URL = "https://www.mobilesuica.com/iq/ir/SuicaDisp.aspx";
    var {body: HTML} = await this._request.post(URL, {form: formData, encoding: null});
    var $ = cheerio.load(this._iconv.convert(HTML).toString());
    //create data
    var output = [];
    if ($('.grybg01 tbody').length) {
      var $2 = $('.grybg01 tbody').eq(1).children().slice(1, -1);
      for (var i = 0; i < $2.length; i++) {
        var columns = $2.eq(i).children();
        var lastMonth = month - 1;
        if (!lastMonth) {
          var lastMonth = 12;
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
      throw 400;
    }
  }
}

module.exports  = suica;

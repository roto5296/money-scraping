var request = require('request-promise');
var qs = require('querystring');
var cheerio = require('cheerio');
var jschardet = require('jschardet');
var Iconv = require('iconv').Iconv;
var url = require('url');

class smbc {
  constructor ({ branch, no, password, options }) {
    this.branch = branch;
    this.no = no;
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
      '_getURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPGetServlet"
      },
      '_postURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPPostServlet"
      },
      '_redirectURL': {
        value: "https://direct3.smbc.co.jp/servlet/com.smbc.SUPRedirectServlet"
      }
    });
  }

  async login () {
    var URL = "https://direct.smbc.co.jp/aib/aibgsjsw5001.jsp";
    var {body: HTML} = await this._request.get(URL);
    var postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        S_BRANCH_CD: this.branch,
        S_ACCNT_NO: this.no,
        PASSWORD: this.password
      }
    );
    await this._request.post(this._postURL, {form: postData});
  }

  async getDetails(year, month){
    const iconv = new Iconv('SHIFT_JIS','UTF-8//TRANSLIT//IGNORE');
    //go to TopPage
    var {body: HTML} = await this._request.get(this._redirectURL, {encoding: null});
    //get Query to get details
    var lastDay = new Date();
    if (lastDay.getYear() !== year || lastDay.getMonth()+1 !== month) {
      lastDay.setYear(year);
      lastDay.setMonth(month);
      lastDay.setDate(0);
    }
    var queryData = Object.assign(
      qs.parse(
        url.parse(
          cheerio.load(
            iconv.convert(HTML).toString()
          )('.detailsBtn a').attr('href')
        ).query
      ),
      {
        FromYear:  ('0'+(year-1988)).slice(-2),
        FromMonth: ('0'+month).slice(-2),
        FromDate:  ('0'+1).slice(-2),
        ToYear:    ('0'+(year-1988)).slice(-2),
        ToMonth:   ('0'+month).slice(-2),
        ToDate:    ('0'+lastDay.getDate()).slice(-2)
      }
    );
    //go to details page
    var {body: HTML} = await this._request.get(this._getURL, {qs: queryData, encoding: null});
    var $ = cheerio.load(iconv.convert(HTML).toString());
    //create data
    if (!$('.CMNerrorMessage').length){
      var output = [];
      $('table.tableStyle.table02.table05.js-even tr').slice(1, -1).each(function(){
        var columns = $(this).children();
        var dateString = columns.eq(0).text().split('.');
        var date = (1988+parseInt(dateString[0].substr(1),10)).toString()
            + "/"
            + dateString[1].replace(/ /g,"0")
            + "/"
          + dateString[2].replace(/ /g,"0");
        var price;
        if (columns.eq(1).text() !== "　") {
          price = parseInt(columns.eq(1).text().replace(/,/g, ""), 10) * -1;
        } else {
          price = parseInt(columns.eq(2).text().replace(/,/g, ""), 10);
        }
        output.push({
          date: date,
          price: price,
          detail: columns.eq(3).text()
        });
      });
      //go to TopPage
      var queryData =qs.parse(
        url.parse($('.glNav01 a').attr('href')).query
      );
      await this._request.get(this._getURL, {qs: queryData});
      return output;
    } else {
      throw 400;
    }
  }
}

module.exports  = smbc;

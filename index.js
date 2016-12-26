const request = require('sync-request');
const options = {}

function strmul(s, n) {
	var r = '';
	for (var i = 0; i < n; ++i) {
		r += s;
	}
	return r;
}
function bold(str) {
  return `*${str}*`;
}
function italic(str) {
  return `_${str}_`;
}
const SlackReporter = function(baseReporterDecorator, config) {
    baseReporterDecorator(this);
    // Configuration
    config.slackReporter = config.slackReporter || {};
    var show = config.slackReporter.show || 'failed';
    var specLength = config.slackReporter.specLength || 50;
    var overviewColumn = config.slackReporter.overviewColumn === false ? false : true;

		options.token = config.slackReporter.apiToken;
		options.channel = config.slackReporter.channel;
    var specorder, specresults;

    this.specSuccess = this.specFailure = this.specSkipped = function(browser, result) {
        if (!result.suite) {
            return;
        }
        var specid = result.suite.join('/') + '/' + result.description;
        if (!(specid in specresults)) {
            specorder.push(specid);
            specresults[specid] = {
                spec: result.suite.slice().concat(result.description),
                results: Object.create(null)
            };
        }
        specresults[specid].results[browser.id] = result;
    }

    // Previously printed spec path
    var currentPath = {};
    this.printSpecLabel = function(spec,summary) {
        if(!currentPath[spec.spec[0]]) currentPath[spec.spec[0]] = [];
        currentPath[spec.spec[0]].push({
          test:spec.spec[1].trim(),
					results:spec.results,
          summary:summary
        })
    };

    this.getResultLabel = function(result) {
        if (result === undefined)
            return ' ? ';
        else if (result.skipped)
            return ' - '
        else if (result.success) {
            if (!result.partial)
                return ' ✓ '
            else
                return '(✓)'
        } else {
            return ' ✗ '
        }
    };

    this.getTableHeader = function(browsers,testTitle) {
        let message = '' + bold(testTitle) + strmul(' ', specLength  - testTitle.length);
        return message;
    }

    this.onRunStart = function() {
        this._browsers = [];
        currentPath = [];
        specorder = [];
        specresults = Object.create(null);
    }

    this.onRunComplete = function(browsers) {
        // Browser overview
        let browserMessage = '*Summary:* \n ```'
        browsers.forEach(function(browser) {
          browserMessage += this.renderBrowser(browser) + '\n'
        }, this);
        browserMessage += ' ``` '
        this.addSlackMessage(browserMessage);

        if (!specorder.length) {
            this.addSlackMessage('No tests did run in any browsers.');
            return;
        }
        var tableHeaderShown = false;

        // Test details
        var counts = {
            shown: 0,
            hidden: 0
        };
        specorder.forEach(function(specid) {
            var sr = specresults[specid];
            // Collect information from all browsers
            var summary = {
                skipped_some: false,
                ran_some: false,
                success: true
            };
            browsers.forEach(function(b) {
                if (sr.results[b.id]) {
                    if (sr.results[b.id].skipped) {
                        summary.skipped_some = true;
                    } else {
                        summary.ran_some = true;
                        summary.success = summary.success && sr.results[b.id].success;
                    }
                } else {
                    summary.skipped_some = true;
                }
            });

            if (summary.success) {
                // Maybe we don't even want to show it
                if (show === 'failed') {
                    if (summary.ran_some)
                        counts.hidden++;
                    return;
                }
                if (show === 'skipped' && !summary.skipped_some) {
                    if (summary.ran_some)
                        counts.skipped++;
                    return;
                }
            }

            // We want to actually display it
            if (!tableHeaderShown) {
                // this.printTableHeader(browsers);
                tableHeaderShown = true;
            }

            this.printSpecLabel(sr,summary);
            if (overviewColumn) {
                // this.writeCommonMsg(' ');
                // this.printResultLabel(summary);
                // this.writeCommonMsg('  ');
            }
            browsers.forEach(function(browser, i) {
              // console.log(i);
              // this.printResultLabel(sr.results[browser.id], i);
            }, this);
            // this.writeCommonMsg('\n');
            counts.shown++;
        }, this);

        if(currentPath) {

          let message = ''
          for (let index in currentPath) {
            message +=  this.getTableHeader(browsers,index) +  '\n'
            currentPath[index].map((spec) => {
              message += '`' + spec.test.trim() + strmul(' ', specLength - spec.test.length) + '`'  + '\n'
            })
						message += '\n'
          }
          this.addSlackMessage(message);
        }
        if (counts.hidden) {
            let message = counts.hidden +
              (counts.shown ? ' more' : '') +
              ' test cases successful in all browsers\n'
            this.addSlackMessage(message);
        }
				this.sendSlackMessages();
    };
		let slackMessages = [];
		this.addSlackMessage = function (message) {
			slackMessages.push(message);
		}
    this.sendSlackMessages = function () {
			let summaryMessage = '';
			slackMessages.map( (message) => summaryMessage += message)
			options.text = summaryMessage;
			var res = request('GET', 'https://slack.com/api/chat.postMessage', {
			  qs: options
			});
			let response = JSON.parse(res.getBody('utf8'));
			if(response.ok) {
				this.writeCommonMsg('Report sent to Slack')
			}
			else {
				this.writeCommonMsg('Error sent report to Slack')
				this.writeCommonMsg(response)
			}
    }
}

SlackReporter.$inject = [
    'baseReporterDecorator',
    'config'
];

module.exports = {
    'reporter:slack': ['type', SlackReporter]
};

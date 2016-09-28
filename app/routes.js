"use strict";
module.exports = function (app) {
	var fuseConfig = require('../config/configuration');
	var messageServer = require('./MessageProcessor');
	var messageClient = require('./MessageBroker');
	var TransData = require('../app/models/TransData');
	var Databases = require('../app/models/DBData');
	var fs = require('fs');
	var q = require('q');
	var transactionLogLocation = ".\\History\\Current\\";
	var amqp = require('amqplib/callback_api');
	var SSH = require('simple-ssh');
	var ssh = new SSH({
		host: fuseConfig.historyServerUrl,
		user: fuseConfig.adeServerUser,
		pass: fuseConfig.adeServerPass
	});

// Helper Methods ================================================================================================================================================================================================

    var parseTransactionData = function (input) {
		console.log('parsing transaction description data');
		var index = input.lastIndexOf("not found in ADE");
		if (index > 0) {
			var error = { "error": "Transaction Does Not exist" };
			return error;
		}
		var lines = input.split('\n');
		var baseLabelKeyword = 'BASE_LABEL';
		var bugNumKeyword = 'BUG_NUM';
		var transDescKeyword = 'ORAREVIEW_DESCRIPTION';
		var baseLabel = '';
		var bugNum = '';
		var transDesc = '';
		for (var i = 0; i < lines.length; i++) {
			if (baseLabel === '' || bugNum === '' || transDesc === '') {
				if (lines[i].includes(bugNumKeyword)) {
					bugNum = (lines[i].substring(lines[i].indexOf(':') + 1)).trim();
					console.log('bugNum : ', bugNum);
				}
				else if (lines[i].includes(transDescKeyword)) {
					transDesc = (lines[i].substring(lines[i].indexOf(':') + 1)).trim();
					console.log('transDesc : ', transDesc);
				}
				else if (lines[i].includes(baseLabelKeyword)) {
					baseLabel = lines[i].substring(lines[i].indexOf(baseLabelKeyword) + baseLabelKeyword.length + 1, lines[i].indexOf('X64') + 3);
					console.log('baseLabel : ', baseLabel);
				}
			} else
				break;
		}
		var transDescription = {
			"baseLabel": { "name": "Base Label for Transaction", "value": baseLabel },
			"bugNum": { "name": "Bug Number", "value": bugNum },
			"transDesc": { "name": "Transaction Description", "value": transDesc }
		};
		return transDescription;
    };
    var getTransactionDetails = function (command) {
		var op = "";
		var deferred = q.defer();
		console.log('Server : Above to describe transaction :', command);
		ssh.exec(command, {
			out: function (stdout) {
				op = op + stdout;
			},
			err: function (stderr) {
				console.error('failed to execute command desc :', stderr);
				return;
			}
		}).exec('echo', {
			out: function (stdout) {
				ssh.end();
				var transactionDescData = parseTransactionData(op);
				deferred.resolve(transactionDescData);
			},
			err: function (stderr) {
				console.error('failed to execute command echo :', stderr);
			}
		}).start();
		return deferred.promise;
	};

	var getTransactionLogFileName = function (transactionName) {
		var newPath = transactionLogLocation + transactionName + '_1';
		var path = newPath.replace(/\\/g, "/");
		fs.open(newPath, 'r', function (error, fd) {
			if (error) {throw new Error("ERROR - failed to open file : " + newPath);}
		});
	};


	// server routes ================================================================================================================================================================================================

    app.post('/api/submit', function (req, res) {
		var currentTransactionData = new TransData({
			name: req.body.name,
			submittedBy: req.body.email,
			currentStatus: 'Queued',
			submittedtime: Date.now(),
			starttime: '',
			endtime: '',
			DBString: req.body.dbString,
			updateBug: req.body.updateBug,
			runJunits: req.body.runJunits
		});

		var queryResult = TransData.find({ $or: [{ name: req.body.name, currentStatus: 'Running' }, { name: req.body.name, currentStatus: 'Queued' }] }, function (err, transData) {
			if (err) {
				console.error('error occured while fetching running transactions :',err);
			}
			else if (transData.length > 0) {
				console.log('Another Request for the Transaction is Already in process :',req.body.name);
				res.status(450).send({ error: "Another Request for the Transaction is Already in process , multiple request for the same transaction can not be submitted" });
			}
			else if (transData.length === 0) {
				currentTransactionData.save(function (err) {
					if (err) {
						console.error('failed to save transaction data to the database : ', err);
					} else {
						console.log('Transaction saved successfully and pre merge will run soon on the transaction: ',req.body.name);
					}
				});
				messageClient.serve(req.body);
			}
    	});
	});

    app.get('/api/info/dbs', function (req, res) {
		Databases.find({}, function (err, dbData) {
			if (err) {
				console.error('error occured while fetching Currently avaliable Databases : ', err);
			}
			else {
				console.log('Currently avaliable Databases count is ', dbData.length);
				res.status(200).json(dbData);
			}
		});
	});

    app.post('/api/transactions/list', function (req, res) {
		console.log('above to receive data for transaction in state :', req.body.transState);
		TransData.find({ "currentStatus": req.body.transState }, function (err, transData) {
			if (err) {
				console.error('error occured while fetching running transactions: ',err);
				throw err;
			}
			else {
				res.status(200).json(transData);
			}
		});
    });

	app.post('/api/transactions/name/output', function (req, res) {
		var localFilePath = req.body.histTrans.logFileName;
		var stat = fs.statSync(localFilePath);
		try {
			res.writeHead(200, {
				'Content-Type': 'application/text',
				'Content-Length': stat.size
			});
			var readStream = fs.createReadStream(localFilePath);
			readStream.pipe(res);
		} catch (error) {
			console.error("unable to read transaction detail ", error);
		}
    });

    app.post('/api/transactions/describe', function (req, res) {
		var command = 'ade describetrans ' + req.body.name;
		getTransactionDetails(command).then(function (newResponse) {
			console.log('Recived details for the transaction from ADE Server : ', newResponse);
			res.status(200).send(newResponse);
		});
    });
};
"use strict";
var amqp = require('amqplib/callback_api');
var SSH = require('simple-ssh');
var fuseConfig = require('../config/configuration');
var fs = require('fs');
var TransData = require('../app/models/TransData');
var mongoose       = require('mongoose');
mongoose.Promise = global.Promise;
mongoose.connect(fuseConfig.dburl);
var db = mongoose.connection;

db.once('open', function() {
 console.log('Server : Child process is connected to the database ');
});

var updateTransactionStatus = function(transaction,status,logFile){
	var query = { "name": transaction.name };
	if (status === "Running") {
        TransData.findOneAndUpdate(query, { "currentStatus": status, "starttime": Date.now(),"logFileName": logFile}, { upsert: false }, function (err, doc) {
			if (err)
				console.error('Unable to update the row for the transaction ' + transaction.name, err);
			else
				console.log('update row for transaction , will start PreMerge process on the transaction :', transaction.name);
		});
    } else if (status === "Archived") {
		TransData.findOneAndUpdate(query, { "currentStatus": status, "endtime": Date.now() ,"logFileName": logFile}, { upsert: false }, function (err, doc) {
			if (err)
				console.error('Unable to update the row for the transaction ' + transaction.name, err);
			else
				console.log('update row for transaction , will start PreMerge process on the transaction :', transaction.name);
		});
    }
};

var updateTransactionErrorStatus = function(transaction){
	var query = { "name": transaction.name };
        TransData.findOneAndUpdate(query, { "currentStatus": "Archived", "starttime": Date.now(),"endtime": Date.now(),"premergeOutput":transaction.error}, { upsert: false }, function (err, doc) {
			if (err)
				console.error('Unable to update the row for the transaction ' + transaction.name, err);
			else
				console.log('update row for transaction , will start PreMerge process on the transaction :', transaction.name);
		});
};

var processTransaction = function(transData){
	var trans = JSON.parse(transData);
	if(trans.description.error){
		updateTransactionErrorStatus(trans);
		return;
	}
	var transName = "jjikumar"+trans.name.substring(trans.name.indexOf('_'));
	console.log('transaction data recived in the child process ',trans);
    var series =  trans.description.baseLabel.value;
	var bugNo = trans.description.bugNum.value;
	var date = new Date();
	var logFile = trans.name+'_'+date.getTime(); 
    var logStream = fs.createWriteStream(fuseConfig.transactionActiveLogLocation+logFile, {'flags': 'a'});
    var viewName = fuseConfig.adeServerUser+'_cloud_'+date.getTime();
    updateTransactionStatus(trans,'Running',fuseConfig.transactionActiveLogLocation+logFile);
    var createViewCommand = 'ade createview '+ viewName + ' -series '+series+' -latest';
    var useViewCommand = 'ade useview -silent '+viewName+' -exec \"ade begintrans '+transName+'_'+date.getTime()+' && ';
    var fetchTransCommand = useViewCommand+'ade fetchtrans '+trans.name+' &&  ';
    var checkInCommand = fetchTransCommand+'ade ci -all &&  ade savetrans && ade settransproperty -p BUG_NUM -v '+bugNo+' && cd &&  ade cleanview  && yes n | /ade/'+viewName+'/fatools/opensource/jauditFixScripts/FinPreMerge/bin/fin_premerge.ksh ';
    var finScriptParams = checkInCommand+' -d '+trans.dbString+' -DupdateBug='+trans.updateBug+' -DrunJUnits='+(trans.runJunits==='Y'?1:0)+' -DapplyPackages='+(trans.applyFPR==='Y'?1:0);
    var destroyTransParam = finScriptParams+' && ade destroytrans -force '+transName +' && exit ';
    var endDelimeter = ' \"';
    var exeCommand = finScriptParams+endDelimeter;
    console.log('command to be executed',exeCommand);
	new SSH({
			host: fuseConfig.historyServerUrl,
			user: fuseConfig.adeServerUser,
			pass: fuseConfig.adeServerPass
	}).exec(createViewCommand, {
        out: function(stdout) {
        	logStream.write(stdout);
            console.log(stdout);
        },
        err: function(stderr) {
            console.log(stderr); 
            return false;
        }
	    }).exec(exeCommand, {
	        out: function(stdout) {
	        	logStream.write(stdout);
	            console.log(stdout);
	        },
	        err: function(stderr) {
	            console.log(stderr); 
	            return false;
	        }
	    }).exec('yes n | ade destroyview -force '+viewName, {
	        out: function(stdout) {
	        	logStream.write(stdout);
	            console.log(stdout);
	        },
	        err: function(stderr) {
	            console.log(stderr); 
	            return false;
	        }
	    }).exec('echo', {
	        out: function(stdout) {
	        	logStream.write('Premerge Process completed');
	            console.log('Premerge Process completed');
				logStream.end();
				var source = fs.createReadStream(fuseConfig.transactionActiveLogLocation+logFile);
				var dest = fs.createWriteStream(fuseConfig.transactionArchivedLogLocation+logFile);
				source.pipe(dest);
				source.on('end', function() { 
					console.log('transaction logs moved to Archived');
					fs.unlink(fuseConfig.transactionActiveLogLocation+logFile);
					dest.end();
				 });
				source.on('error', function(err) { 
					console.error('failed to move transaction logs to Archived');	
				});
	            updateTransactionStatus(trans,'Archived',fuseConfig.transactionArchivedLogLocation+logFile);
				return;
	        },
	        err: function(stderr) {
	            console.log(stderr); 
	            return false;
	        }
	    })
    .start();
};
processTransaction(process.argv[2]);
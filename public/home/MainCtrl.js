/**
 * Created by jitender choudhary on 10/28/2016.
 */

angular.module('MainCtrl', []).controller('MainController', function ($rootScope, $scope, $http) {

    $scope.transaction = {
        name: '',
        email: '',
        updateBug: 'N',
        runJunits: 'N',
        applyFPR: 'N',
        allowDBOverride:'Y',
        errorMsg: {
            transactionError: '',
            DBError: ''
        },
        description: {
            "baseLabel": '{"name":"","value":""}',
            "bugNum": { "name": "", "value": "" },
            "transDesc": { "name": "", "value": "" }
        }
    };
    $scope.errorMsg = "";
    $scope.projectList = [];
    $scope.junitSelectedList = [];

    $scope.submitTransaction = function () {
        var trans = $scope.transaction;
        $scope.transaction = {
            name: '',
            email: '',
            updateBug: 'N',
            runJunits: 'N',
            applyFPR: 'N',
            allowDBOverride:'Y',
            errorMsg: {
                transactionError: '',
                DBError: ''
            },
            description: {
                "baseLabel": '{"name":"","value":""}',
                "bugNum": { "name": "", "value": "" },
                "transDesc": { "name": "", "value": "" }
            }
        };
        $scope.errorMsg = "";
         if($scope.junitSelectedList.length!==0){
            trans.junitSelectedList = $scope.junitSelectedList;
            $scope.junitSelectedList = [];
        }
       
        $http.post('/api/submit', trans).success(function (response) {
            console.log('Client : Recieved Data from server', response);
        }).error(function (err) {
            console.log('Client : Recieved Data from server', err);
            if (variable !== null){
                $scope.errorMsg = err.error;
            }
            
        });
    };

    $scope.getDBInformation = function () {
        $http.get('/api/info/dbs', $scope.transaction).success(function (response) {
            $scope.dbs = response;
            console.log('Client : Recieved Data from server', response);
        }).error(function (err) {
            console.log('Client : Recieved Data from server', err);
            $scope.transaction.errorMsg.transactionError = err.error;
        });
    };

    $scope.changeDB = function (val) {
        $scope.transaction.dbString = val.connectionString;
         $scope.transactionSubmitform.dbstring.$setDirty();
    };
    $scope.getDBInformation();

    $('#transactionname').click(function () {
        var value=$('#transactionname').val();
        if(value){
            $scope.transactionSubmitform.transaction.$setDirty();
        }else{
            $scope.transactionSubmitform.$setPristine();
        }
    });

      $scope.updateProjectList = function () {
        var series = {val : 'FUSIONAPPS_PT.V2MIBPRCX_LINUX.X64'}; 
        console.log('updating list of procects for series :',series);
        $http.post('/api/updateProjectList', series).success(function (response) {
            console.log('Client : ProjectList Updated Successfully', response);
        }).error(function (err) {
            console.log('Client : Failed To update projectlist', err);
        });
    };

    $scope.getProjectList = function(){
          $http.get('/api/getProjectList', $scope.transaction).success(function (response) {
              for (var i in  response[0].list) {
				$scope.projectList.push({id: response[0].list[i],"label" : response[0].list[i].substring(response[0].list[i].lastIndexOf('/')+1)});
			}
           // console.log('Client : ProjectList Received from server', $scope.projectList);
        }).error(function (err) {
            console.log('Client : failed to get projectList from the server', err);
        });
    };
    $scope.getProjectList();

     $scope.projectListConfigParams = {
                        enableSearch: true,
                        scrollableHeight: '500px',
                        scrollable: true,
                        smartButtonMaxItems: 3,
                        smartButtonTextConverter: function(itemText, originalItem) {return itemText;}
                        };
     $scope.projectListDisplayText = {buttonDefaultText: 'Select Project to run Junits'}
});
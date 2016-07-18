/* 
Node-OpenDroneMap Node.js App and REST API to access OpenDroneMap. 
Copyright (C) 2016 Node-OpenDroneMap Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
$(function(){
    function hoursMinutesSecs(t){
        var ch = 60 * 60 * 1000,
            cm = 60 * 1000,
            h = Math.floor(t / ch),
            m = Math.floor( (t - h * ch) / cm),
            s = Math.round( (t - h * ch - m * cm) / 1000),
            pad = function(n){ return n < 10 ? '0' + n : n; };
      if( s === 60 ){
        m++;
        s = 0;
      }
      if( m === 60 ){
        h++;
        m = 0;
      }
      return [pad(h), pad(m), pad(s)].join(':');
    }

    function TaskList(){
        var uuids = JSON.parse(localStorage.getItem("odmTaskList") || "[]");
        if (Object.prototype.toString.call(uuids) !== "[object Array]") uuids = [];

        this.tasks = ko.observableArray($.map(uuids, function(uuid){
            return new Task(uuid);
        }));
    }
    TaskList.prototype.add = function(task) {
        this.tasks.push(task);
        this.saveTaskListToLocalStorage();
    };
    TaskList.prototype.saveTaskListToLocalStorage = function(){
        localStorage.setItem("odmTaskList", JSON.stringify($.map(this.tasks(), function(task){
                return task.uuid;
            })
        ));
    };
    TaskList.prototype.remove = function(task){
        this.tasks.remove(function(t){
            return t === task;
        });
        this.saveTaskListToLocalStorage();
    };

    function Task(uuid){
        var self = this;

        this.uuid = uuid;
        this.loading = ko.observable(true);
        this.info = ko.observable({});
        this.viewingOutput = ko.observable(false);
        this.output = ko.observableArray();
        this.resetOutput();
        this.timeElapsed = ko.observable("00:00:00");

        var codes = {
            QUEUED: 10,
            RUNNING: 20,
            FAILED: 30,
            COMPLETED: 40,
            CANCELED: 50
        };
        var statusCodes = {
            10: {
                descr: "Queued",
                icon: "glyphicon-hourglass"
            },
            20: {
                descr: "Running",
                icon: "glyphicon-cog spinning"
            },
            30: {
                descr: "Failed",
                icon: "glyphicon-remove-circle"
            },
            40: {
                descr: "Completed",
                icon: "glyphicon-ok-circle"
            },
            50: {
                descr: "Canceled",
                icon: "glyphicon-ban-circle"
            }
        };

        this.statusDescr = ko.pureComputed(function(){
            if (this.info().status && this.info().status.code){
                if(statusCodes[this.info().status.code]){
                    return statusCodes[this.info().status.code].descr;
                }else return "Unknown (Status Code: " + this.info().status.code + ")";
            }else return "-";
        }, this);
        this.icon = ko.pureComputed(function(){
            if (this.info().status && this.info().status.code){
                if(statusCodes[this.info().status.code]){
                    return statusCodes[this.info().status.code].icon;
                }else return "glyphicon-question-sign";
            }else return "";
        }, this);
        this.showCancel = ko.pureComputed(function(){
            return this.info().status && 
            (this.info().status.code === codes.QUEUED || this.info().status.code === codes.RUNNING);
        }, this);
        this.showRestart = ko.pureComputed(function(){
            return this.info().status && 
            (this.info().status.code === codes.CANCELED);
        }, this);
        this.showRemove = ko.pureComputed(function(){
            return this.info().status && 
            (this.info().status.code === codes.FAILED || this.info().status.code === codes.COMPLETED || this.info().status.code === codes.CANCELED);
        }, this);
        this.showDownload = ko.pureComputed(function(){
            return this.info().status && 
            (this.info().status.code === codes.COMPLETED);
        }, this);
        this.startRefreshingInfo();
    }
    Task.prototype.refreshInfo = function(){
        var self = this;
        var url = "/task/" + this.uuid + "/info";
        $.get(url)
         .done(function(json){
            // Track time

            if (json.processingTime && json.processingTime !== -1){
                self.timeElapsed(hoursMinutesSecs(json.processingTime));
            }
            self.info(json);
         })
         .fail(function(){
            self.info({error: url + " is unreachable."});
         })
         .always(function(){ self.loading(false); });
    };
    Task.prototype.consoleMouseOver = function(){ this.autoScrollOutput = false; }
    Task.prototype.consoleMouseOut = function(){ this.autoScrollOutput = true; } 
    Task.prototype.resetOutput = function(){
        this.viewOutputLine = 0;
        this.autoScrollOutput = true;
        this.output.removeAll();
    };
    Task.prototype.viewOutput = function(){
        var self = this;

        function fetchOutput(){
            var url = "/task/" + self.uuid + "/output";
            $.get(url, {line: self.viewOutputLine})
             .done(function(output){
                for (var i in output){
                    self.output.push(output[i]);
                }
                if (output.length){
                    self.viewOutputLine += output.length;
                    if (self.autoScrollOutput){
                        var $console = $("#console_" + self.uuid);
                        $console.scrollTop($console[0].scrollHeight - $console.height())
                    }
                }
             })
             .fail(function(){
                self.info({error: url + " is unreachable."});
             });
        }
        this.fetchOutputInterval = setInterval(fetchOutput, 2000);
        fetchOutput();

        this.viewingOutput(true);
    };
    Task.prototype.hideOutput = function(){
        if (this.fetchOutputInterval) clearInterval(this.fetchOutputInterval);
        this.viewingOutput(false);
    };
    Task.prototype.startRefreshingInfo = function() {
        var self = this;
        this.stopRefreshingInfo();
        this.refreshInfo();
        this.refreshInterval = setInterval(function(){
            self.refreshInfo();
        }, 500); // TODO: change to larger value
    };
    Task.prototype.stopRefreshingInfo = function() {
        if (this.refreshInterval){
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    };
    Task.prototype.remove = function() {
        var self = this;
        var url = "/task/remove";

        $.post(url, {
            uuid: this.uuid
        })
        .done(function(json){
            if (json.success || self.info().error){
                taskList.remove(self);
            }else{
                self.info({error: json.error});
            }

            self.stopRefreshingInfo();
        })
        .fail(function(){
            self.info({error: url + " is unreachable."});
            self.stopRefreshingInfo();
        });
    };

    function genApiCall(url, onSuccess){
        return function(){
            var self = this;

            $.post(url, {
                uuid: this.uuid
            })
            .done(function(json){
                if (json.success){
                    if (onSuccess !== undefined) onSuccess(self, json);
                    self.startRefreshingInfo();
                }else{
                    self.stopRefreshingInfo();
                    self.info({error: json.error});
                }
            })
            .fail(function(){
                self.info({error: url + " is unreachable."});
                self.stopRefreshingInfo();
            });
        }
    };
    Task.prototype.cancel = genApiCall("/task/cancel");
    Task.prototype.restart = genApiCall("/task/restart", function(task){
        task.resetOutput();
    });
    Task.prototype.download = function(){
        location.href = "/task/" + this.uuid + "/download/all";
    };

    var taskList = new TaskList();
    ko.applyBindings(taskList);

    // Handle uploads
    $("#images").fileinput({
        uploadUrl: '/task/new',
        showPreview: false,
        allowedFileExtensions: ['jpg', 'jpeg'],
        elErrorContainer: '#errorBlock',
        showUpload: false,
        uploadAsync: false,
        uploadExtraData: function(){
            return {
                name: $("#taskName").val()
            };
        }
    });

    $("#btnUpload").click(function(){
        $("#btnUpload").attr('disabled', true)
                        .val("Uploading...");

        // Start upload
        $("#images").fileinput('upload');
    });     

    var btnUploadLabel = $("#btnUpload").val();
    $("#images")
        .on('filebatchuploadsuccess', function(e, params){
            $("#images").fileinput('reset');

            if (params.response.success && params.response.uuid){
                taskList.add(new Task(params.response.uuid));
            }
        })
        .on('filebatchuploadcomplete', function(){
            $("#btnUpload").removeAttr('disabled')
                            .val(btnUploadLabel);
        })
        .on('filebatchuploaderror', function(e, data, msg){
        });
});

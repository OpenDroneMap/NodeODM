$(function(){
    function TaskList(){
        var uuids = JSON.parse(localStorage.getItem("odmTaskList") || "[]");
        if (Object.prototype.toString.call(uuids) !== "[object Array]") uuids = [];

        this.tasks = ko.observableArray($.map(uuids, function(uuid){
            return new Task(uuid);
        }));
    }
    TaskList.prototype.addNew = function(task) {
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
        this.uuid = uuid;
        this.loading = ko.observable(true);
        this.info = ko.observable({});

        var statusCodes = {
            10: {
                descr: "Queued",
                icon: "glyphicon-hourglass"
            },
            20: {
                descr: "Running",
                icon: "glyphicon-refresh spinning"
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
                    console.log(statusCodes[this.info().status.code].icon);
                    return statusCodes[this.info().status.code].icon;
                }else return "glyphicon-question-sign";
            }else return "";
        }, this);
        this.canceled = ko.pureComputed(function(){
            return this.info().status && this.info().status.code === 50;
        }, this);

        this.refreshInfo();
    }
    Task.prototype.refreshInfo = function(){
        var self = this;
        var url = "/taskInfo/" + this.uuid;
        $.get(url)
         .done(self.info)
         .fail(function(){
            self.info({error: url + " is unreachable."});
         })
         .always(function(){ self.loading(false); });
    };
    Task.prototype.remove = function() {
        var self = this;
        var url = "/removeTask";

        $.post(url, {
            uuid: this.uuid
        })
        .done(function(json){
            if (json.success || self.info().error){
                taskList.remove(self);
            }else{
                self.info({error: json.error});
            }
        })
        .fail(function(){
            self.info({error: url + " is unreachable."});
        });
    };

    function genApiCall(url){
        return function(){
            var self = this;

            $.post(url, {
                uuid: this.uuid
            })
            .done(function(json){
                if (json.success){
                    self.refreshInfo();
                }else{
                    self.info({error: json.error});
                }
            })
            .fail(function(){
                self.info({error: url + " is unreachable."});
            });
        }
    };
    Task.prototype.cancel = genApiCall("/cancelTask");
    Task.prototype.restart = genApiCall("/restartTask");

    var taskList = new TaskList();
    ko.applyBindings(taskList);

    // Handle uploads
    $("#images").fileinput({
        uploadUrl: '/newTask',
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
                taskList.addNew(new Task(params.response.uuid));
            }
        })
        .on('filebatchuploadcomplete', function(){
            $("#btnUpload").removeAttr('disabled')
                            .val(btnUploadLabel);
        })
        .on('filebatchuploaderror', function(e, data, msg){
        });
});

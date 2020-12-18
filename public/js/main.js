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
$(function() {
    if ( window.location !== window.parent.location ) {
        // The page is in an iframe, broadcast height
        setInterval(function() {
            window.parent.postMessage(document.body.scrollHeight, "*");
        }, 200); 
    }

    function App(){
        this.mode = ko.observable("file");
        this.filesCount = ko.observable(0);
        this.error = ko.observable("");
        this.uploading = ko.observable(false);
        this.uuid = ko.observable("");
        this.uploadedFiles = ko.observable(0);
        this.fileUploadStatus = new ko.observableDictionary({});
        this.uploadedPercentage = ko.pureComputed(function(){
            return ((this.uploadedFiles() / this.filesCount()) * 100.0) + "%";
        }, this);
    }
    App.prototype.toggleMode = function(){
        if (this.mode() === 'file') this.mode('url');
        else this.mode('file');
    };
    App.prototype.dismissError = function(){
        this.error("");
    };
    App.prototype.resetUpload = function(){
        this.filesCount(0);
        this.error("");
        this.uploading(false);
        this.uuid("");
        this.uploadedFiles(0);
        this.fileUploadStatus.removeAll();
        dz.removeAllFiles(true);
    };
    App.prototype.startTask = function(){
        var self = this;
        this.uploading(true);
        this.error("");
        this.uuid("");

        var die = function(err){
            self.error(err);
            self.uploading(false);
        };

        // Start upload
        var formData = new FormData();
        formData.append("name", $("#taskName").val());
        formData.append("webhook", $("#webhook").val());
        formData.append("skipPostProcessing", !$("#doPostProcessing").prop('checked'));
        formData.append("options", JSON.stringify(optionsModel.getUserOptions()));
        // formData.append("outputs", JSON.stringify(['odm_orthophoto/odm_orthophoto.tif']));

        if (this.mode() === 'file'){
            if (this.filesCount() > 0){
                $.ajax("/task/new/init?token=" + token, {
                    type: "POST",
                    data: formData,
                    processData: false,
                    contentType: false
                }).done(function(result){
                    if (result.uuid){
                        self.uuid(result.uuid);
                        dz.processQueue();
                    }else{
                        die(result.error || result);
                    }
                }).fail(function(){
                    die("Cannot start task. Is the server available and are you connected to the internet?");
                });
            }else{
                die("No files selected");
            }
        } else if (this.mode() === 'url'){
            this.uploading(true);
            formData.append("zipurl", $("#zipurl").val());

            $.ajax("/task/new?token=" + token, {
                type: "POST",
                data: formData,
                processData: false,
                contentType: false
            }).done(function(json){
                if (json.uuid){
                    taskList.add(new Task(json.uuid));
                    self.resetUpload();
                }else{
                    die(json.error || result);
                }
            }).fail(function(){
                die("Cannot start task. Is the server available and are you connected to the internet?");
            });
        }
    }

    Dropzone.autoDiscover = false;

    var dz = new Dropzone("div#images", {
        paramName: function(){ return "images"; },
        url : "/task/new/upload/",
        parallelUploads: 8, // http://blog.olamisan.com/max-parallel-http-connections-in-a-browser max parallel connections
        uploadMultiple: false,
        acceptedFiles: "image/*,text/*,application/*",
        autoProcessQueue: false,
        createImageThumbnails: false,
        previewTemplate: '<div style="display:none"></div>',
        clickable: document.getElementById("btnSelectFiles"),
        chunkSize: 2147483647,
        timeout: 2147483647
    });

    dz.on("processing", function(file){
        this.options.url = '/task/new/upload/' + app.uuid() + "?token=" + token;
        app.fileUploadStatus.set(file.name, 0);
    })
    .on("error", function(file){
        // Retry
        console.log("Error uploading ", file, " put back in queue...");
        app.error("Upload of " + file.name + " failed, retrying...");
        file.status = Dropzone.QUEUED;
        app.fileUploadStatus.remove(file.name);
        dz.processQueue();
    })
    .on("uploadprogress", function(file, progress){
        app.fileUploadStatus.set(file.name, progress);
    })
    .on("addedfiles", function(files){
        app.filesCount(app.filesCount() + files.length);
    })
    .on("complete", function(file){
        if (file.status === "success"){
            app.uploadedFiles(app.uploadedFiles() + 1);
        }
        app.fileUploadStatus.remove(file.name);
        dz.processQueue();
    })
    .on("queuecomplete", function(files){
        // Commit
        $.ajax("/task/new/commit/" + app.uuid() + "?token=" + token, {
            type: "POST",
        }).done(function(json){
            if (json.uuid){
                taskList.add(new Task(json.uuid));
                app.resetUpload();
            }else{
                app.error(json.error || json);
            }
            app.uploading(false);
        }).fail(function(){
            app.error("Cannot commit task. Is the server available and are you connected to the internet?");
            app.uploading(false);
        });
    })
    .on("reset", function(){
        app.filesCount(0);
    });

    app = new App();
    ko.applyBindings(app, document.getElementById('app'));

    function query(key) {
        key = key.replace(/[*+?^$.\[\]{}()|\\\/]/g, "\\$&"); // escape RegEx meta chars
        var match = location.search.match(new RegExp("[?&]"+key+"=([^&]+)(&|$)"));
        return match && decodeURIComponent(match[1].replace(/\+/g, " "));
    }

    var token = query('token') || "";

    function hoursMinutesSecs(t) {
        var ch = 60 * 60 * 1000,
            cm = 60 * 1000,
            h = Math.floor(t / ch),
            m = Math.floor((t - h * ch) / cm),
            s = Math.round((t - h * ch - m * cm) / 1000),
            pad = function(n) { return n < 10 ? '0' + n : n; };
        if (s === 60) {
            m++;
            s = 0;
        }
        if (m === 60) {
            h++;
            m = 0;
        }
        return [pad(h), pad(m), pad(s)].join(':');
    }

    function TaskList() {
        var self = this;
        var url = "/task/list?token=" + token;
        this.error = ko.observable("");
        this.loading = ko.observable(true);
        this.tasks = ko.observableArray();

        $.get(url)
            .done(function(tasksJson) {
                if (tasksJson.error){
                    self.error(tasksJson.error);
                }else{
                    for (var i in tasksJson){
                        self.tasks.push(new Task(tasksJson[i].uuid));
                    }
                }
            })
            .fail(function() {
                self.error(url + " is unreachable.");
            })
            .always(function() { self.loading(false); });
    }
    TaskList.prototype.add = function(task) {
        this.tasks.push(task);
    };
    TaskList.prototype.remove = function(task) {
        this.tasks.remove(function(t) {
            return t === task;
        });
    };

    var codes = {
        QUEUED: 10,
        RUNNING: 20,
        FAILED: 30,
        COMPLETED: 40,
        CANCELED: 50
    };

    function Task(uuid) {
        var self = this;

        this.uuid = uuid;
        this.loading = ko.observable(true);
        this.info = ko.observable({});
        this.viewingOutput = ko.observable(false);
        this.output = ko.observableArray();
        this.resetOutput();
        this.timeElapsed = ko.observable("00:00:00");

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

        this.statusDescr = ko.pureComputed(function() {
            if (this.info().status && this.info().status.code) {
                if (statusCodes[this.info().status.code]) {
                    return statusCodes[this.info().status.code].descr;
                } else return "Unknown (Status Code: " + this.info().status.code + ")";
            } else return "-";
        }, this);
        this.icon = ko.pureComputed(function() {
            if (this.info().status && this.info().status.code) {
                if (statusCodes[this.info().status.code]) {
                    return statusCodes[this.info().status.code].icon;
                } else return "glyphicon-question-sign";
            } else return "";
        }, this);
        this.showCancel = ko.pureComputed(function() {
            return this.info().status &&
                (this.info().status.code === codes.QUEUED || this.info().status.code === codes.RUNNING);
        }, this);
        this.showRestart = ko.pureComputed(function() {
            return this.info().status &&
                (this.info().status.code === codes.CANCELED);
        }, this);
        this.showRemove = ko.pureComputed(function() {
            return this.info().status &&
                (this.info().status.code === codes.FAILED || this.info().status.code === codes.COMPLETED || this.info().status.code === codes.CANCELED);
        }, this);
        this.showDownload = ko.pureComputed(function() {
            return this.info().status &&
                (this.info().status.code === codes.COMPLETED);
        }, this);
        this.startRefreshingInfo();
    }
    Task.prototype.refreshInfo = function() {
        var self = this;
        var url = "/task/" + this.uuid + "/info?token=" + token;
        $.get(url)
            .done(function(json) {
                // Track time

                if (json.processingTime && json.processingTime !== -1) {
                    self.timeElapsed(hoursMinutesSecs(json.processingTime));
                }
                if (json.status && json.status.code && [codes.COMPLETED, codes.FAILED, codes.CANCELED].indexOf(json.status.code) !== -1){
                    self.stopRefreshingInfo();
                    self.copyOutput();
                }

                self.info(json);
            })
            .fail(function() {
                self.info({ error: url + " is unreachable." });
            })
            .always(function() { self.loading(false); });
    };
    Task.prototype.consoleMouseOver = function() { this.autoScrollOutput = false; };
    Task.prototype.consoleMouseOut = function() { this.autoScrollOutput = true; };
    Task.prototype.resetOutput = function() {
        this.viewOutputLine = 0;
        this.autoScrollOutput = true;
        this.output.removeAll();
    };
    Task.prototype.openInfo = function(){
        location.href='/task/' + this.uuid + '/info?token=' + token;
    };
    Task.prototype.copyOutput = function(){
        var self = this;
        var url = "/task/" + self.uuid + "/output";
            $.get(url, { token: token })
                .done(function(output) {
                    localStorage.setItem(self.uuid + '_output', JSON.stringify(output));
                })
                .fail(function() {
                    console.warn("Cannot copy output for " + self.uuid);
                });
    };
    Task.prototype.downloadOutput = function(){
        var self = this;
        var url = "/task/" + self.uuid + "/output";
            $.get(url, { token: token })
                .done(function(output) {
                    var wnd = window.open("about:blank", "", "_blank");
                    if (output.length === 0){
                        output = JSON.parse(localStorage.getItem(self.uuid + '_output') || []);
                    }
                    wnd.document.write(output.join("<br/>"));
                })
                .fail(function() {
                    self.info({ error: url + " is unreachable." });
                });
    };
    Task.prototype.viewOutput = function() {
        var self = this;

        function fetchOutput() {
            var url = "/task/" + self.uuid + "/output";
            $.get(url, { line: -9, token: token })
                .done(function(output) {
                    if (output.length === 0){
                        output = JSON.parse(localStorage.getItem(self.uuid + '_output') || []);
                    }
                    self.output(output);
                })
                .fail(function() {
                    self.info({ error: url + " is unreachable." });
                });
        }
        this.fetchOutputInterval = setInterval(fetchOutput, 5000);
        fetchOutput();

        this.viewingOutput(true);
    };
    Task.prototype.hideOutput = function() {
        if (this.fetchOutputInterval) clearInterval(this.fetchOutputInterval);
        this.viewingOutput(false);
    };
    Task.prototype.startRefreshingInfo = function() {
        var self = this;
        this.stopRefreshingInfo();
        this.refreshInfo();
        this.refreshInterval = setInterval(function() {
            self.refreshInfo();
        }, 2000);
    };
    Task.prototype.stopRefreshingInfo = function() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    };
    Task.prototype.remove = function() {
        var self = this;
        var url = "/task/remove?token=" + token;

        function doRemove() {
            localStorage.removeItem(self.uuid + '_output');

            $.post(url, {
                    uuid: self.uuid
                })
                .done(function(json) {
                    if (json.success || self.info().error) {
                        taskList.remove(self);
                    } else {
                        self.info({ error: json.error });
                    }

                    self.stopRefreshingInfo();
                })
                .fail(function() {
                    self.info({ error: url + " is unreachable." });
                    self.stopRefreshingInfo();
                });
        }

        if (this.info().status && this.info().status.code === codes.COMPLETED) {
            if (confirm("Are you sure?")) doRemove();
        } else {
            doRemove();
        }
    };

    function genApiCall(url, onSuccess) {
        return function() {
            var self = this;

            $.post(url, {
                    uuid: this.uuid
                })
                .done(function(json) {
                    if (json.success) {
                        if (onSuccess !== undefined) onSuccess(self, json);
                        self.startRefreshingInfo();
                    } else {
                        self.stopRefreshingInfo();
                        self.info({ error: json.error });
                    }
                })
                .fail(function() {
                    self.info({ error: url + " is unreachable." });
                    self.stopRefreshingInfo();
                });
        };
    }
    Task.prototype.cancel = genApiCall("/task/cancel?token=" + token);
    Task.prototype.restart = genApiCall("/task/restart?token=" + token, function(task) {
        task.resetOutput();
    });
    Task.prototype.downloadLink = function(){
        return "/task/" + this.uuid + "/download/all.zip?token=" + token;
    };
    Task.prototype.download = function() {
        location.href = this.downloadLink();
    };

    var taskList = new TaskList();
    ko.applyBindings(taskList, document.getElementById('taskList'));

    $('#resetWebhook').on('click', function(){
        $("#webhook").val('');
    });

    $('#resetDoPostProcessing').on('click', function(){
        $("#doPostProcessing").prop('checked', false);
    });
    $('#resetTaskName').on('click', function(){
        $("#taskName").val('');
    });

    // Load options
    function Option(properties) {
        this.properties = properties;

        this.defaultValue = undefined;
        if (properties.type === 'bool' && properties.value === 'true'){
            this.defaultValue = true;
        }else if (properties.type === 'enum'){
            this.defaultValue = properties.value;
        }

        if (this.properties.help !== undefined && this.properties.domain !== undefined){
            var choicesStr = typeof this.properties.domain === "object" ? this.properties.domain.join(", ") : this.properties.domain;

            this.properties.help = this.properties.help.replace(/\%\(choices\)s/g, choicesStr);
            this.properties.help = this.properties.help.replace(/\%\(default\)s/g, this.properties.value);
        }
        
        this.value = ko.observable(this.defaultValue);
    }
    Option.prototype.resetToDefault = function() {
        this.value(this.defaultValue);
    };

    function OptionsModel() {
        var self = this;

        this.options = ko.observableArray();
        this.options.subscribe(function() {
            setTimeout(function() {
                $('#options [data-toggle="tooltip"]').tooltip();
            }, 100);
        });
        this.showOptions = ko.observable(false);
        this.error = ko.observable();

        $.get("/options?token=" + token)
            .done(function(json) {
                if (json.error) self.error(json.error);
                else {
                    for (var i in json) {
                        self.options.push(new Option(json[i]));
                    }
                }
            })
            .fail(function() {
                self.error("options are not available.");
            });
    }
    OptionsModel.prototype.getUserOptions = function() {
        var result = [];
        for (var i = 0; i < this.options().length; i++) {
            var opt = this.options()[i];
            if (opt.properties.name == 'feature-type') console.log(opt, opt.value());
            if (opt.properties.type === 'enum'){
                if (opt.value() !== opt.defaultValue){
                    result.push({
                        name: opt.properties.name,
                        value: opt.value()
                    });
                }
            }else{
                if (opt.value() !== undefined) {
                    result.push({
                        name: opt.properties.name,
                        value: opt.value()
                    });
                }
            }
        }
        return result;
    };

    var optionsModel = new OptionsModel();
    ko.applyBindings(optionsModel, document.getElementById("options"));
});
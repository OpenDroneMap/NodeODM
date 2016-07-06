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
        this.statusDescr = ko.pureComputed(function(){
            if (this.info().status && this.info().status.code){
                switch(this.info().status.code){
                    case 10: return "Queued";
                    case 20: return "Running";
                    case 30: return "Failed";
                    case 40: return "Completed";
                    default: return "Unknown (Status Code: " + this.info().status.code + ")";
                }
            }else return "-";
        }, this);

        var self = this;
        var url = "/taskInfo/" + uuid;
        $.get(url)
         .done(self.info)
         .fail(function(){
            self.info({error: url + " is unreachable."});
         })
         .always(function(){ self.loading(false); });
    }
    Task.prototype.remove = function() {
        taskList.remove(this);
    };

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
    	var btnUploadLabel = $("#btnUpload").val();
    	$("#btnUpload").attr('disabled', true)
    					.val("Uploading...");

    	$("#images")
    		.fileinput('upload')
			.on('filebatchuploadsuccess', function(e, params){
				$("#images").fileinput('reset');

                // TODO: this is called multiple times
                // consider switching file upload plugin.
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
});

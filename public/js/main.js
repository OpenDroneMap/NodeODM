$(function(){
    $("#images").fileinput({
    	uploadUrl: '/newTask',
    	showPreview: false,
        allowedFileExtensions: ['jpg', 'jpeg'],
        elErrorContainer: '#errorBlock',
        showUpload: false,
        uploadAsync: false,
        uploadExtraData: () => {
        	return {
        		name: $("#taskName").val()
        	};
        }
    });

    $("#btnUpload").click(() => {
    	var btnUploadLabel = $("#btnUpload").val();
    	$("#btnUpload").attr('disabled', true)
    					.val("Uploading...");

    	$("#images")
    		.fileinput('upload')
			.on('filebatchuploadsuccess', function(e, files, extra){
				$("#images").fileinput('reset');
			})
			.on('filebatchuploadcomplete', function(){
				$("#btnUpload").removeAttr('disabled')
								.val(btnUploadLabel);
			})
			.on('filebatchuploaderror', function(e, data, msg){
			});
    });		
});

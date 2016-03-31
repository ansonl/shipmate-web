var Pickup = {
	phoneNumber: null, // Default value of phone number
    latestDict: null,
    mapMarker: null,
    phoneAndTimeHolder: null,
    phoneNumberTitle: null,
    timeTitle: null,
    locationTitle: null,
    statusTitle: null,
    actionButtonHolder: null,
    actionButton: null,
    
    generateActionButtonForStatus : function (updatedDict) {
        //create action button
        var actionButton = $('<button></button>');
        actionButton.addClass('btn');
        addStatusClassAndTextToButton(actionButton, updatedDict['status']+1);
        this.actionButton = actionButton;

        actionButton.click(makeStatusChangeRequest(updatedDict['phoneNumber'], updatedDict['status']+1, this));
        this.actionButtonHolder.children().detach();
        this.actionButtonHolder.append(actionButton);
    },
    updateElements : function(updatedDict) {
        //console.log(updatedDict)
        
        if (this.actionButtonHolder == null) {
            //create action button container that will have all action buttons
            var actionButtonHolder = $('<div></div>');
            actionButtonHolder.addClass('actionButtonHolder');
            this.actionButtonHolder = actionButtonHolder;
        }
        this.generateActionButtonForStatus(updatedDict);

        //create phone and time span if needed
        if (this.phoneAndTimeHolder == null) {
           this.phoneAndTimeHolder = $('<span></span>');
        }

        var formattedPhoneNumber = updatedDict['phoneNumber'].slice(0,3)+"-"+updatedDict['phoneNumber'].slice(3,6)+"-"+updatedDict['phoneNumber'].slice(6);
        //update phone number p element
        if (this.phoneNumberTitle == null) {
            var phoneNumberLink = $('<a></a>');
            phoneNumberLink.attr('href', 'tel:'+formattedPhoneNumber);

            var phoneNumberTitle = $('<p></p>');
            phoneNumberTitle.addClass('phoneNumberTitle');

            phoneNumberLink.append(phoneNumberTitle);

            this.phoneAndTimeHolder.append(phoneNumberLink);
            this.phoneNumberTitle = phoneNumberTitle;
        }
        this.phoneNumberTitle.text(formattedPhoneNumber);
        
        //update time p element
        if (this.timeTitle == null) {
            var timeTitle = $('<p></p>');
            timeTitle.addClass('latestTimeTitle');
            this.phoneAndTimeHolder.append(timeTitle);
            this.timeTitle = timeTitle;
        }
        var latestTimeObject = new Date(updatedDict['latestTime']);
        var differenceMilliseconds = new Date() - latestTimeObject;
        var differenceMinutes = differenceMilliseconds / (1000 * 60);
        var presentedTimeDifference;
        if (differenceMinutes < 1) {
            presentedTimeDifference = "< 1 minute ago"
        } else {
            presentedTimeDifference = "~ "+Math.floor(differenceMinutes)+" minute"+((Math.floor(differenceMinutes) == 1) ? '' : 's')+" ago";
        }
        this.timeTitle.text(presentedTimeDifference);
        
        //update location p element
        if (this.locationTitle == null) {
            var locationTitle = $('<p></p>');
            locationTitle.addClass('locationTitle');
            this.locationTitle = locationTitle;
        }
        this.locationTitle.text(updatedDict['latestLocation']['latitude']+','+updatedDict['latestLocation']['longitude']);
        reverseGeocode(updatedDict['latestLocation']['latitude'], updatedDict['latestLocation']['longitude'], this.locationTitle);

        //update status p element
        if (this.statusTitle == null) {
            var statusTitle = $('<p></p>');
            statusTitle.addClass('statusTitle');
            this.statusTitle = statusTitle; 
        }
        addStatusClassToTitle(this.statusTitle, updatedDict['status']);
        this.statusTitle.text('Status: '+presentedStatusForNumber(updatedDict['status']));
        
        //update marker
        var newLocation =  new google.maps.LatLng(updatedDict['latestLocation']['latitude'], updatedDict['latestLocation']['longitude']);
        if (this.mapMarker == null) {
            this.mapMarker = new google.maps.Marker({
                position: newLocation,
                'zIndex': 0
            });

            var save=updateDetailActionView(this);
            this.mapMarker.addListener('click', save);
            
        } else {
            if (this.latestDict['latestLocation']['latitude'] != updatedDict['latestLocation']['latitude'] || this.latestDict['latestLocation']['longitude'] != updatedDict['latestLocation']['longitude']) {
                this.mapMarker.setPosition(newLocation);
            }
        }
        this.latestDict = updatedDict;
    }
}

//function factory for updating detail and action view
function updateDetailActionView(pickupObj) {
    function updateFunction() {
        $('#detailViewColumn').children().detach();
        $('#detailViewColumn').append([pickupObj.phoneAndTimeHolder, pickupObj.locationTitle, pickupObj.statusTitle]);
        $('#actionDynamic').children().detach();
        $('#actionDynamic').append(pickupObj.actionButtonHolder);
        
    }
    return updateFunction;
}

//function factory for status change request using closure. Update UI in closured function as well
function makeStatusChangeRequest(phone, statusNumber, pickupObj) {
    var statusRequestString;
    switch(statusNumber) { //statusNumber is what we want to change the status to
            case 0:
                statusRequestString = "cancel";
                break;
            case 1:
                statusRequestString = "???";
                break;
            case 2:
                statusRequestString = "confirm";
                break;
            case 3:
                statusRequestString = "complete";
                break;
            default:
                statusRequestString = "Unknown" + statusNumber;
                return function(){alert("Uknown function factory request for status ", statusNumber)};
        }

    var targetURL = baseServerURL+'/'+statusRequestString+'Pickup';
    //console.log(targetURL);
    function statusRequest() {

        if (statusNumber==3) //ask to make sure they want to proceed if completing a pickup
            if (!confirm('Mark '+phone+' as completed?\nThis pickup will be removed from the map.'))
                return;

        $.ajax({
            type:"POST",
            dataType: 'text json',
            url: targetURL,
            data: 
            {
                phrase: "usnashipmate2016",
                phoneNumber: phone
            },
            success: function(data, textStatus) {
                console.log(data);
                switch(parseInt(data['status'])) { //status returned as string instead of int, we should change that on the server as some point
                    case 0: //update success, update the passed targetPickupDiv and targetStatusDiv
                        //change the pickup's status div to the new status
                        pickupObj.statusTitle.text(presentedStatusForNumber(statusNumber))

                        addStatusClassToTitle(pickupObj.statusTitle, statusNumber);

                        //update the pickup object's dict with new status preemtively before we sort them
                        pickupObj.latestDict['status'] = statusNumber;
                        pickupObj.generateActionButtonForStatus(pickupObj.latestDict);
                        //addStatusClassAndTextToButton(pickupObj.actionButton, statusNumber + 1);
                        break;
                    default: //the returned status was not zero so something went wrong, handle accordingly with error?
                        alert('status change failed with return status of ' + data['status']);

                }
            },
            error: function(data, textStatus) {
                console.log(data, textStatus);
            }
        });
    }
    return statusRequest;
}

//apply correct status class for status title according to current status
function addStatusClassToTitle(titleElement, statusNumber) {
    titleElement.removeClass('inactiveTitle pendingTitle confirmedTitle completedTitle')
    switch(statusNumber) {
        case 0:
            titleElement.addClass('inactiveTitle');
            break;
        case 1: //pending
            titleElement.addClass('pendingTitle');
            break;
        case 2: //confirmed
            titleElement.addClass('confirmedTitle');
            break;
        case 3: //completed
            titleElement.addClass('completedTitle');
            break;
        default:
            console.log('Unknown status ' + statusNumber);
    }
}

//apply correct button class for action button according to current status
function addStatusClassAndTextToButton(titleElement, statusNumber) {
    titleElement.removeClass('btn-default btn-primary btn-success btn-info btn-success btn-warning btn-danger')
    switch(statusNumber) {
        case 0://cancel
            titleElement.addClass('btn-default');
            titleElement.text('Cancel');
            break;
        case 1: //pend
            titleElement.addClass('btn-default');
            titleElement.text('???');
            break;
        case 2: //confirm
            titleElement.addClass('btn-warning');
            titleElement.text('Confirm');
            break;
        case 3: //complete
            titleElement.addClass('btn-success');
            titleElement.text('Complete');
            break;
        default:
            //console.log('Unknown status ' + statusNumber);
            titleElement.addClass('btn-default');
            titleElement.text('???');
            titleElement.css('display', 'none');
    }
}

//reverse geocode a lat/lng and replace element's text with result
function reverseGeocode(targetLat, targetLong, targetLocationElement) {
    var requestURL = 'https://maps.googleapis.com/maps/api/geocode/json?latlng='+targetLat+','+targetLong;
    $.ajax({
        type:"GET",
        dataType: 'text json',
        url: requestURL,
        success: function(data, textStatus) {
            if ('results' in data && data['results'].length > 0) {
                var shortedAddress = data['results'][0]['formatted_address'].replace(/(, USA)$/, '');
                targetLocationElement.text(shortedAddress);
            }
        },
        error: function(data, textStatus) {
            console.log(data, textStatus);
        }
    });

    if (navigator.geolocation) {
        // Register for location changes
        var watchId = navigator.geolocation.watchPosition(locationUpdate, locationError, {enableHighAccuracy: true,timeout: Infinity,maximumAge: 0});
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}
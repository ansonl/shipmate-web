var baseServerURL = "https://navy-shipmate.herokuapp.com";
//var baseServerURL = "http://mich302csd17u:8080";
//var baseServerURL = "http://mich201csd16u:8080";

var currentLocation = false;

var pickupObjects = {};

var mapReference;
var currentPositionMarker;

var centerOnLocationUpdate = true;

//geolocation-marker library object reference
var GeoMarker;
var audioElement;

var phrase;

$(document).ready(function () {
    setupMapCanvas($('#mapCanvas'));
    $('.messageContainer').hide();

    phrase = window.prompt('Please enter a phrase','');
    while (phrase == null || phrase.length == 0) {
        var noPhraseConfirm = confirm('Continue without a phrase?');
        if (noPhraseConfirm == true)
            break;
        phrase = window.prompt('Please enter a phrase','');
    }

    if (navigator.geolocation) {
        // Register for location changes
        var watchId = navigator.geolocation.watchPosition(locationUpdate, locationError, {enableHighAccuracy: true,timeout: Infinity,maximumAge: 0});
    } else {
        //alert("Geolocation is not supported by this browser. \nPeople will not be able to see the van location. :(");
        showDriverAlertMessage('Location Unavailable!', 'We can\'t get your device\'s location, people won\'t be able to see the van\'s location.');  
    }

    //try to get wakelock on screen when it is finally supported
    if (!navigator.hasOwnProperty('requestWakeLock') || navigator.requestWakeLock('screen') == null) {
        console.log('Navigator.requestWakeLock() not supported...yet. ')
    }

    //start repeat calls of pickup and van location update funtions
    loopFunctionWithTimeout(updateAllPickups, 3000);
    loopFunctionWithTimeout(updateVanLocation, 10000);

    //setup Map center button click handler
    $('#mapCenterBtn').click(function(){setMapBounds()});

    //setup refresh pickups button click handler
    $('#refreshPickupsBtn').click(function(){updateAllPickups()});

    //setup list all pickups button click handler
    $('#listAllPickupsBtn').click(function(){showAllPickupsMessage()});

    //load audio
    audioElement = document.createElement('audio');
    audioElement.setAttribute('src', 'assets/kizilsungur__sweetalertsound5.wav');
});

function loopFunctionWithTimeout(someFunction, timeout) {
    someFunction();
    window.setTimeout(function() {loopFunctionWithTimeout(someFunction, timeout)},timeout);
}

function updateVanLocation() {
    
    //return if no location
    if (!currentLocation) {
        console.log("no current location for updateVanLocation");
       //window.setTimeout(updateVanLocation,1000);
        return;
    }
    

    $.ajax({
        type:"POST",
        dataType: 'text json',
        url: baseServerURL+"/updateVanLocation",
        data: 
        {
            phrase: phrase,
            vanNumber: 1,
            latitude: currentLocation.lat(),
            longitude: currentLocation.lng()
        },
        success: function(data, textStatus) {
            //console.log("van update success", data, textStatus);
        },
        error: function(data, textStatus) {
            console.log(data, textStatus);
        }
    });
}

function updateAllPickups() {
    $.ajax({
        type:"POST",
        dataType: 'text json',
        url: baseServerURL+"/getPickupList",
        data: 
        {
            phrase: phrase,
        },
        success: function(data, textStatus) {
            updatePickupMarkers(data, textStatus);
        },
        error: function(data, textStatus) {
            console.log(data, textStatus);
            showDriverAlertMessage('Connection Down!', 'Device has no internet. We\'ll keep retrying.');  

        }
    });
}

function setupMapCanvas(targetMapDiv) {
    var centerPosition;
    if (currentLocation) {
        centerPosition = currentLocation;
    } else {
        //center on USNA
        centerPosition = new google.maps.LatLng(38.9844, -76.4889);
    }

    var myStyles =[
        {
            featureType: "poi",
            elementType: "labels",
            stylers: [
                  { visibility: "off" }
            ]
        },
        {
            featureType: "transit",
            elementType: "labels",
            stylers: [
                  { visibility: "off" }
            ]
        }
    ];
    var mapOptions = {
        zoom: 17,
        center: centerPosition,
        disableDefaultUI: true,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: myStyles
    };
    map = new google.maps.Map(targetMapDiv.get(0), mapOptions);

    /*
    currentPositionMarker = new google.maps.Marker({
        position: centerPosition,
        map: map,
    });
    */

    mapReference = map;

    GeoMarker = new GeolocationMarker(map,{'clickable':false});

    setMapBounds();
}

function setMapBounds() {
    
    console.log("setting map bounds");

    //default to usna coordinates
    var minLat = 38.9844;
    var minLng = -76.4889;
    var maxLat = 38.9844;
    var maxLng = -76.4889;
    
    /*
    //default to washington dc coordinates
    var minLat = 38.913692;
    var minLng = -77.033114;
    var maxLat = 38.913692;
    var maxLng = -77.033114;
    console.log("set bounds dc");
    */

    //if we have current location, start bounds at current location
    if (currentLocation) {
        console.log("set bounds current")
        minLat = currentLocation.lat();
        minLng = currentLocation.lng();
        maxLat = currentLocation.lat();
        maxLng = currentLocation.lng();
    } else {
              
    }

    //console.log(minLat, minLng, maxLat, maxLng);

    //loop through all pickups and get min and max coordinates
    for (var phoneNumber in pickupObjects) {
        if (pickupObjects[phoneNumber].latestDict['status'] > 0 && pickupObjects[phoneNumber].latestDict['status'] < 3)  { //only bound to active pickups
            var markerLat = pickupObjects[phoneNumber].latestDict['latestLocation']['latitude'];
            var markerLng = pickupObjects[phoneNumber].latestDict['latestLocation']['longitude'];
            if (markerLat < minLat || isNaN(minLat))
                minLat = markerLat;
            if (markerLat > maxLat || isNaN(maxLat))
                maxLat = markerLat;
            if (markerLng < minLng || isNaN(minLng))
                minLng = markerLng;
            if (markerLng > maxLng || isNaN(maxLng))
                maxLng = markerLng;
        }
    }

    //create SW and NE LatLng objects and create bounds
    var southWest = new google.maps.LatLng(minLat, minLng);
    var northEast = new google.maps.LatLng(maxLat, maxLng);
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(southWest);
    bounds.extend(northEast);
    mapReference.fitBounds(bounds);
}

function updatePickupMarkers(data, textStatus) {

    var oldPhoneNumbers = Object.keys(pickupObjects);

    for (var key in data) {
        var phoneNumber = data[key]['phoneNumber'];

        //do stuff with pickup if status is pending, confirmed, else delete it
        if (data[key]['status'] > 0 && data[key]['status'] < 3) {

            if (phoneNumber in pickupObjects) {
                pickupObjects[phoneNumber].updateElements(data[key]);
            } else {
                pickupObjects[phoneNumber] = Object.create(Pickup);
                pickupObjects[phoneNumber].updateElements(data[key]);
                //$('#allPickupsDiv').append(currentPickupDiv);
            } 
            
            if (pickupObjects[phoneNumber].mapMarker.getMap() == null) {
                pickupObjects[phoneNumber].mapMarker.setMap(mapReference);
            }
        } else {
            //remove marker and delete object if we do not need object (not pending/confirm)
            if (phoneNumber in pickupObjects) {
                pickupObjects[phoneNumber].mapMarker.setMap(null);
                delete pickupObjects[phoneNumber]; //remove not pending or confirmed pickups from dict
            }
        }
    }

    //reorderPickupsInDict(pickupObjects);

    //Only consider setting Map Bounds if the pickup objects keys have changed
    var newPhoneNumbers = Object.keys(pickupObjects);

    if (newPhoneNumbers.length == oldPhoneNumbers.length) {
        var update = false;
        for (var i = 0, l=newPhoneNumbers.length; i < l; i++) {
            if (oldPhoneNumbers.indexOf(newPhoneNumbers[i]) == -1) {
                update = true;
                audioElement.play();
            }   
        }
        if (update) {
            setMapBounds();
        }
    } else if (newPhoneNumbers.length > oldPhoneNumbers.length) { //more pickups, at least one should be new
        audioElement.play();
        setMapBounds();
    } else if (newPhoneNumbers.length > 0) { //if old/new array length delta, only set bounds if there are any pickups
        setMapBounds();
    }
    
    /*
    //only update if object exist
    if (Object.keys(pickupObjects).length > 0) {
        setMapBounds();
    }
    */
}

function locationUpdate(position) {
    //create new LatLng object
    var newLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
    console.log('Location updated. ' + newLocation);

    //Check if the location has actually changed, this way we do not recalculate map route for no change.
    if (currentLocation && currentLocation.lat() == newLocation.lat() && currentLocation.lng() == newLocation.lng()) {
        //console.log("No location change.");
        return;
    }

    //set global currentLocation object to the new LatLng object
    currentLocation = newLocation;

    //DISABLED based on feedback from drivers 02APR16 (Dan Iskandar at ArmyNavyStarMeet16), they wanted it to stop moving the map around all the time
    //center on currect location if no pickups
    /*
    if (Object.keys(pickupObjects).length == 0 && centerOnLocationUpdate == true) {
        //mapReference.setCenter(currentLocation)
        console.log("location update, no pickups, center on geomarker");
        map.fitBounds(GeoMarker.getBounds());
        centerOnLocationUpdate = false;
    } else {
        setMapBounds();
    }
    */
    //instead, just center on location for first location update ever
    if (centerOnLocationUpdate == true) {
        map.fitBounds(GeoMarker.getBounds());
        centerOnLocationUpdate = false;
    }


    //update current position marker if using google maps market object
    //currentPositionMarker.setPosition(currentLocation);
}

function locationError(error) {
    console.log('Failed to get location.\n' + error.message);
    showDriverAlertMessage('Location Unavailable!', 'Device provided error:<br/>' + error.message);  
    
}

//returns the status that should be presented to the user for a statusNumber, NOT the request url for changing status
function presentedStatusForNumber(statusNumber) {
    var statusText;
    switch(statusNumber) {
        case 0:
            statusText = "Inactive";
            break;
        case 1:
            statusText = "Pending";
            break;
        case 2:
            statusText = "Confirmed";
            break;
        case 3:
            statusText = "Completed";
            break;
        default:
            statusText = "Unknown status " + statusNumber;
    }
    return statusText;
}

function showDriverAlertMessage(title, body) {
    $('#driverAlertMessageContainer .messageTitle').html(title);
    $('#driverAlertMessageContainer .messageBody').html(body);
    $('#driverAlertMessageContainer').fadeIn('fast').delay(10000).fadeOut('fast');
}

function showAllPickupsMessage() {
    var messageSpan = $('<span></span>');
    var keyArray = Object.keys(pickupObjects);
    for (var i = 0; i < keyArray.length; i++) {
        listItem = $('<p></p>');
        listItem.text(keyArray[i] + ' - ' + presentedStatusForNumber(pickupObjects[keyArray[i]].latestDict.status));
        messageSpan.append(listItem);
    }
    $('#listAllNumbersContainer .messageTitle').text('All Recent Pickups');
    $('#listAllNumbersContainer .messageBody').empty().append(messageSpan);
    $('#listAllNumbersContainer').fadeIn('fast');
}
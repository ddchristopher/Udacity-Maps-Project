
function AppModel() {
	const self = this;

	self.lists = data.lists;
	self.places = data.places;
	//Display a loading indicator while the initMap function promises are resolving
	self.loading = ko.observable(true);

	//Observables used to render the UI
	self.placeAddress = ko.observable();
	self.placeName = ko.observable('Click a place from the list or a marker on the map to show more information.');
	self.fsCheckIns = ko.observable();
	self.tips = ko.observableArray();
	self.fsLink = ko.observable();
	self.list = ko.observableArray(self.places);
	self.photos = ko.observableArray([{url: '#'}]);
	self.markers = [];

	//Methods to filter the markers by the selected dropdown item
	self.setList = function(list) {
		let name = list.name;
		let filteredList = self.places.filter(place => place.category === name);
		self.list(filteredList);
		let filteredMarkers = self.markers.filter(marker => marker.category === name);
		self.showMarkers(filteredMarkers);
	};
	self.resetList = function() {
		self.list(self.places);
		self.showMarkers(self.markers);
	};

	//Method that links the places and markers by comparing their placeId property
	//Centers the map on the selected location's marker
	//Sets the photos and FourSquare data
	self.showMarker = function(data, event, marker){
		let placeId = marker ? marker.placeId : data.placeId;
		let targetMarker = self.markers.filter(entry => entry.placeId === placeId);
		let targetPlace = self.places.filter(entry => entry.placeId === placeId);
		let photos = [];
		if (targetMarker[0].photos.length > 0){
			photos = targetMarker[0].photos;
			self.photos(photos);
		}
		self.placeAddress(targetMarker[0].address);
		self.placeName(targetMarker[0].title);
		self.zoomTo(targetMarker[0]);
		self.getFSData(targetPlace[0]);
	};

	//Foursquare API Request for place information
	self.FSInfo = function(place) {
		let position = place.position.toString();
		position = position.slice(1, position.length -1);
		position = position.replace(/\s/g,'');
		let title = place.name.replace(/venice/g,'');
		title = title.replace(/\s/g,'%20');
		let search = 'venues/search?v=20161016';
		return new Request(`
					https://api.foursquare.com/v2/
					${search}
					&ll=${position}
					&query=${title}
					&intent=match
					&radius=1000
					&client_id=NRBES1ZJWYEFWDLDRP1R0H50C0PSEG4POGDYSUXU1H3UFSB0
					&client_secret=BS35FVBY10KVA2VB2TYNHEQKWIWR5O2MXRRYNJCCJ0INUPW3
					`);
	};

	//Foursquare API Request for tip information
	self.FStips = function(fsId) {
		let id = fsId.toString();
		return new Request(`
					https://api.foursquare.com/v2/
					venues/${id}/tips?v=20131016
					&sort=popular&limit=2
					&client_id=NRBES1ZJWYEFWDLDRP1R0H50C0PSEG4POGDYSUXU1H3UFSB0
					&client_secret=BS35FVBY10KVA2VB2TYNHEQKWIWR5O2MXRRYNJCCJ0INUPW3
					`);
	};

	// Methods to fetch FourSquare Data, format it, and store it in the Model
	self.getFStips = function(FSid) {
		return fetch(self.FStips(FSid))
			.then(response => response.json())
			.then(data => {
				self.tips.removeAll();
				let dataList = data.response.tips.items.slice(0,4);
				for (let item of dataList) {
					let firstName = item.user.firstName;
					let lastName = item.user.lastName ? item.user.lastName : '';
					let tipAuthor = `Tip by ${firstName} ${lastName} @Foursquare`;
					let tip = {tip: item.text, author: tipAuthor};
					self.tips.push(tip);
				}
			})
			.catch(error => alert('Unable to retrieve Foursquare tips: ' + error));
	};

	self.getFSData = function(place) {
		return fetch(self.FSInfo(place))
			.then(response => response.json())
			.then(data => {
				let id = data.response.venues[0].id;
				self.fsCheckIns(`Foursquare CheckIns: ${data.response.venues[0].stats.checkinsCount}`);
				self.fsLink(`https://foursquare.com/v/${id}`);
				return id;
			})
			.then(id =>
				self.getFStips(id, place))
			.catch(error => alert('Unable to retrieve Foursquare data: ' + error));
	};



	//SideBar Functionality
	self.slideOut = 'matrix(1, 0, 0, 1, -999, 0)';
	self.slideIn = 'translateX(0)';
	const $locationList = $('#location-list');
	const $locationBarPosition = $locationList.css('transform');
	self.locationBarPosition = ko.observable($locationBarPosition);
	self.slideLocationBar = () => {
		const slider = self.locationBarPosition() === self.slideOut ? self.slideIn : self.slideOut;
		self.locationBarPosition(slider);
	};
}




let map;
const $window = $(window);
const AppViewModel = new AppModel();

function mapsAPIError(){
	alert('The map could not be loaded');
}

// Function to initialize the map within the map div
// Used to set up markers and store location data
function initMap() {
	map = new google.maps.Map(document.getElementById('map'), {
		center: {lat: 45.438255, lng: 12.329012},
		zoom: 14
	});

	const service = new google.maps.places.PlacesService(map);


	//Makes a promise that will call the Google Maps API
	function makePromise(entry, queries){
		return new Promise((resolve, reject) => {
			setTimeout(function(){
				service.getDetails({
					placeId: entry.placeId
				}, function (place, status) {
					if (status === google.maps.places.PlacesServiceStatus.OK) {
						place.category = entry.category;
						resolve(place);
					} else {
						reject(status);
					}
				});
			}, queries*250);
		});
	}


	//For each place entry in the AppViewModel, create a promise that will call the Google Maps API
	const places = [];
	let queries = 0;
	for (let entry of AppViewModel.places) {
		//Stagger the requests to avoid
		queries++;
		let placePromise = makePromise(entry, queries);
		places.push(placePromise);
	}

	//Function to add marker positions to the model
	function addPositions (marker) {
		AppViewModel.places.forEach(place => {
			if (place.placeId === marker.placeId) {
				place.position = marker.position;
			}
		});
	}

	//Function to add listeners to markers to show info when clicked
	function applyMarker(marker) {
		marker.addListener('click', function() {
			AppViewModel.showMarker("","",this);
			marker.setAnimation(google.maps.Animation.BOUNCE);
			setTimeout(function(){
				marker.setAnimation(null);
			}, 1400);
		});
	}

	//Wait for all promises to resolve
	//Create markers, add event listeners, and store them in the AppViewModel along with their corresponding locations
	Promise.all(places).then((places) => {
		for (let place of places) {
			let photos = [];
			if (place.photos.length > 0) {
				for (let i = 0; i < 4; i++) {
					photos.push({url: place.photos[i].getUrl({'maxWidth': 500, 'maxHeight': 500})});
				}
			}
			let marker = new google.maps.Marker({
				title: place.name,
				placeId: place.place_id,
				position: place.geometry.location,
				animation: google.maps.Animation.DROP,
				address: place.formatted_address,
				rating: place.rating,
				photos: photos,
				category: place.category,
			});
			addPositions(marker);
			applyMarker(marker);
			AppViewModel.markers.push(marker);

		}
	})
	//Add methods to show, filter, and zoom to the markers
		.then(() => {
			AppViewModel.showMarkers = function(markers) {
				for (let marker of this.markers) {
					marker.setMap(null);
				}
				let bounds = new google.maps.LatLngBounds();
				for (let marker of markers) {
					marker.setMap(map);
					bounds.extend(marker.position);
				}
				map.fitBounds(bounds);
			};
			AppViewModel.zoomTo = function(marker) {
				map.setCenter(marker.position);
				marker.setAnimation(google.maps.Animation.BOUNCE);
				setTimeout(function(){
					marker.setAnimation(null);
				}, 1400);
				map.setZoom(18);
			};
			//Remove loading indicator and show all markers once they are loaded
			AppViewModel.loading(false);
			AppViewModel.showMarkers(AppViewModel.markers);
		})
		.catch((status) => {
			alert('Unable to load locations. Error: ' + status);
		});
}

//Watch window for resize and retract sidebar
$window.resize(function(){
	const screenSize =  $(window).width();
	let listPosition = AppViewModel.locationBarPosition();
	if (screenSize > 768 && listPosition === AppViewModel.slideOut) {
		AppViewModel.locationBarPosition('translateX(0)');
	} else if (screenSize < 768) {
		AppViewModel.locationBarPosition(AppViewModel.slideOut);
	}
});

ko.applyBindings(AppViewModel);

















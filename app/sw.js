import idb from 'idb';

let staticCache='restaurant-static-content';
let photoCache='restaurant-photo-content';
let allCaches = [
  staticCache,
  photoCache
];

var dbPromise = idb.open('mws-sailsaway', 1, upgradeDb => {
  switch(upgradeDb.oldVersion) {
    case 0:
      upgradeDb.createObjectStore('restaurants', { keyPath: 'id' });
  }
});

self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open(staticCache).then(function(cache) {
        return cache.addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/scripts/main.js',
          '/scripts/dbhelper.js',
          '/scripts/restaurant_info.js',
          '/sw.js',
          '/css/styles.css',
          '/css/responsive.css'
        ]).catch(function(error) {
          console.log(error);
        });
      })
    );
  });


  self.addEventListener('activate', function(event) {
    event.waitUntil(
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.filter(function(cacheName) {
            return cacheName.startsWith('restaurant-') &&
                   !allCaches.includes(cacheName);
          }).map(function(cacheName) {
            return caches.delete(cacheName);
          })
        );
      })
    );
  });

  self.addEventListener("fetch", event => {
    let cacheRequest = event.request;

    let cacheUrlObj = new URL(event.request.url);
    console.log(`URL is ${cacheUrlObj}`);
    if (event.request.url.indexOf("restaurant.html") > -1) {
      const cacheURL = "restaurant.html";
      cacheRequest = new Request(cacheURL);
    }

    // Requests going to the API get handled separately
    const checkURL = new URL(event.request.url);
    if (checkURL.port === "1337") {
      const parts = checkURL
        .pathname
        .split("/");
      let id = checkURL
        .searchParams
        .get("restaurant_id") - 0;
      if (!id) {
        if (checkURL.pathname.indexOf("restaurants")) {
          id = parts[parts.length - 1] === "restaurants"
            ? "-1"
            : parts[parts.length - 1];
        } else {
          id = checkURL
            .searchParams
            .get("restaurant_id");
        }
      }
      handleAJAXEvent(event, id);
    } else {
      handleNonAJAXEvent(event, cacheRequest);
    }
  });

  const handleAJAXEvent = (event, id) => {
    // Only use caching for GET events
    if (event.request.method !== "GET") {
      return fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return json
        });
    }

      handleRestaurantEvent(event, id);

  }

  const handleRestaurantEvent = (event, id) => {
    // Check the IndexedDB to see if the JSON for the API has already been stored
    // there. If so, return that. If not, request it from the API, store it, and
    // then return it back.
    event.respondWith(dbPromise.then(db => {
      return db
        .transaction("restaurants")
        .objectStore("restaurants")
        .get(id);
    }).then(data => {
      return (data && data.data) || fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return dbPromise.then(db => {
            const tx = db.transaction("restaurants", "readwrite");
            const store = tx.objectStore("restaurants");
            store.put({id: id, data: json});
            return json;
          });
        });
    }).then(finalResponse => {
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response("Error fetching data", {status: 500});
    }));
  };

  const handleNonAJAXEvent = (event, cacheRequest) => {
    // Check if the HTML request has previously been cached. If so, return the
    // response from the cache. If not, fetch the request, cache it, and then return
    // it.
    event.respondWith(caches.match(cacheRequest).then(response => {
      return (response || fetch(event.request).then(fetchResponse => {
        return caches
          .open(cacheID)
          .then(cache => {
            if (fetchResponse.url.indexOf("browser-sync") === -1) {
              cache.put(event.request, fetchResponse.clone());
            }
            return fetchResponse;
          });
      }).catch(error => {
        if (event.request.url.indexOf(".jpg") > -1) {
          return caches.match("/img/na.png");
        }
        return new Response("Application is not connected to the internet", {
          status: 404,
          statusText: "Application is not connected to the internet"
        });
      }));
    }));
  };

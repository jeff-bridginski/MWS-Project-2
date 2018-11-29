import idb from 'idb';

let allCaches='restaurant-static-content';

var dbPromise = idb.open('mws-sailsaway', 3, upgradeDb => {
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore("restaurants", {keyPath: "id"});
  }
});

self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open(staticCache).then(function(cache) {
        return cache.addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/css/styles.css',
          '/css/responsive.css',
          '/scripts/main.js',
          '/scripts/dbhelper.js',
          '/scripts/restaurant_info.js',
          '/sw.js'

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

  self.addEventListener('fetch', event => {
    let cacheRequest = event.request;

    let cacheUrlObj = new URL(event.request.url);
    console.log(`URL is ${cacheUrlObj}`);
    if (event.request.url.indexOf('restaurant.html') > -1) {
      const cacheURL = 'restaurant.html';
      cacheRequest = new Request(cacheURL);
    }

    const checkURL = new URL(event.request.url);
    if (checkURL.port === '1337') {
      const parts = checkURL
        .pathname
        .split('/');
      let id = checkURL
        .searchParams
        .get('restaurant_id') - 0;
      if (!id) {
        if (checkURL.pathname.indexOf('restaurants')) {
          id = parts[parts.length - 1] === 'restaurants'
            ? '-1'
            : parts[parts.length - 1];
        } else {
          id = checkURL
            .searchParams
            .get('restaurant_id');
        }
      }
      handleAJAXEvent(event, id);
    } else {
      handleNonAJAXEvent(event, cacheRequest);
    }
  });

  const handleAJAXEvent = (event, id) => {
    if (event.request.method !== 'GET') {
      return fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return json
        });
    }

      handleRestaurantEvent(event, id);

  }

  const handleRestaurantEvent = (event, id) => {
    event.respondWith(dbPromise.then(db => {
      return db
        .transaction('restaurants')
        .objectStore('restaurants')
        .get(id);
    }).then(data => {
      return (data && data.data) || fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return dbPromise.then(db => {
            const tx = db.transaction('restaurants', 'readwrite');
            const store = tx.objectStore('restaurants');
            store.put({id: id, data: json});
            return json;
          });
        });
    }).then(finalResponse => {
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response('Error fetching data', {status: 500});
    }));
  };

  const handleNonAJAXEvent = (event, cacheRequest) => {
    event.respondWith(caches.match(cacheRequest).then(response => {
      return (response || fetch(event.request).then(fetchResponse => {
        return caches
          .open(cacheID)
          .then(cache => {
            if (fetchResponse.url.indexOf('browser-sync') === -1) {
              cache.put(event.request, fetchResponse.clone());
            }
            return fetchResponse;
          });
      }).catch(error => {
        return new Response('Application is not connected to the internet', {
          status: 404,
          statusText: 'Application is not connected to the internet'
        });
      }));
    }));
  };

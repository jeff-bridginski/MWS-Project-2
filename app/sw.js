import idb from 'idb';

let allCaches='restaurant-static-content';

const dbPromise = idb.open('mws-sailsaway', 4, upgradeDB => {
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore('restaurants', {keyPath: 'id'});
    case 1:
      {
        const reviewsStore = upgradeDB.createObjectStore('reviews', {keyPath: 'id'});
        reviewsStore.createIndex('restaurant_id', 'restaurant_id');
      }
    case 2:
      upgradeDB.createObjectStore('pending', {
        keyPath: 'id',
        autoIncrement: true
      });
  }
});

self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open(allCaches).then(function(cache) {
        return cache.addAll([
          '/',
          '/index.html',
          '/restaurant.html',
          '/review.html',
          '/css/styles.css',
          '/css/responsive.css',
          '/scripts/main.js',
          '/scripts/dbhelper.js',
          '/scripts/restaurant_info.js',
          '/scripts/review.js',
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
    //console.log(`URL is ${cacheUrlObj}`);
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
        console.log(id);
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
    if (event.request.url.indexOf('reviews') > -1) {
      handleReviewsEvent(event, id); //For handling reveiws
    } else {
      handleRestaurantEvent(event, id); //For handling resturant requests.
  }
}

  const handleReviewsEvent = (event, id) => {
    event.respondWith(dbPromise.then(db => {
      return db
        .transaction('reviews')
        .objectStore('reviews')
        .index('restaurant_id')
        .getAll(id);
    }).then(data => {
      return (data.length && data) || fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(data => {
          return dbPromise.then(idb => {
            const itx = idb.transaction('reviews', 'readwrite');
            const store = itx.objectStore('reviews');
            data.forEach(review => {
              store.put({id: review.id, 'restaurant_id': review['restaurant_id'], data: review});
            })
            return data;
          })
        })
    }).then(finalResponse => {
      if (finalResponse[0].data) {
        // Need to transform the data to the proper format
        const mapResponse = finalResponse.map(review => review.data);
        return new Response(JSON.stringify(mapResponse));
      }
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response('Error fetching data', {status: 500})
    }))
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
    // Check if the HTML request has previously been cached. If so, return the
    // response from the cache. If not, fetch the request, cache it, and then return
    // it.
    event.respondWith(caches.match(cacheRequest).then(response => {
      return (response || fetch(event.request).then(fetchResponse => {
        return caches
          .open(allCaches)
          .then(cache => {
            if (fetchResponse.url.indexOf('browser-sync') === -1) {
              cache.put(event.request, fetchResponse.clone());
            }
            return fetchResponse;
          });
      }).catch(error => {
        if (event.request.url.indexOf('.jpg') > -1) {
          return caches.match('/img/na.png');
        }
        return new Response('Application is not connected to the internet', {
          status: 404,
          statusText: 'Application is not connected to the internet'
        });
      }));
    }));
  };

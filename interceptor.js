import axios from "axios";

// Axios defaults
const baseURL = "https://example.com";
axios.defaults.baseURL = baseURL;

// Active http requests
let activeRequests = 0;

/**
 * Request interceptor
 * Adds a default configuration to axios (baseUrl, token, content-type, etc.)
 * Counts active http requests
 */
axios.interceptors.request.use(
  config => {
    let token = null;

    if (config.url === "/auth/refresh") {
      token = localStorage.getItem("refresh_token") || null;
    } else {
      token = localStorage.getItem("access_token") || null;
    }

    if (token != null) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Count plus active requests to our API
    activeRequests++;

    return config;
  },
  err => {
    return Promise.reject(err);
  }
);

/**
 * Response interceptor for handling 401 error
 * Queueing failed requests in an array
 * Automatically trying refresh token after the first fail
 * Refreshing the token only once and applying the new token to the requests which were queued
 * Counts finished http requests
 */

// Refreshing flag
let isRefreshing = false;
let subscribers = [];

function subscribeTokenRefresh(cb) {
  subscribers.push(cb);
}

function onRrefreshed(token) {
  if (activeRequests > 0) {
    return setTimeout(onRrefreshed, 100);
  }
  subscribers.map(cb => cb(token));
  subscribers = [];
}

axios.interceptors.response.use(
  response => {
    // Count minus active requests to our API
    activeRequests--;

    return response;
  },
  error => {
    // Count minus active requests to our API
    activeRequests--;

    if (error.response) {
      // The request was made and the server responded with a status code
      // That falls out of the range of 2xx+

      const { config, response: { status } } = error;
      const originalRequest = config;

      // The request failed because it lacks valid authentication credentials
      if (status === 401) {
        if (!isRefreshing && !subscribers.length) {
          isRefreshing = true;
          refreshToken()
            .then(response => {
              const { data } = response;
              isRefreshing = false;
              onRrefreshed(data.access_token);
              localStorage.setItem("access_token", data.access_token);
              localStorage.setItem("refresh_token", data.refresh_token);
            })
            .catch(err => {
              forceLogout();
            });
        }

        const requestSubscribers = new Promise(resolve => {
          subscribeTokenRefresh(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(axios(originalRequest));
          });
        });

        return requestSubscribers;
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message);
    }
    return Promise.reject(error.response);
  }
);

// Refresh token function
function refreshToken() {
  return axios.post("/auth/refresh").then(function(response) {
    return response;
  });
}

// Logout function, used if token refreshing fails
function forceLogout() {
  isRefreshing = false;
  localStorage.clear();
  window.location = "/auth/login";
}

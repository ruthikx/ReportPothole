import 'dotenv/config';

export default {
  expo: {
    name: "Pothole Reporter",
    slug: "pothole-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1a73e8"
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow Pothole Reporter to access your camera to take photos of potholes."
        }
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Allow Pothole Reporter to access your location to report pothole positions."
        }
      ],
      "expo-status-bar"
    ],
    ios: {
      icon: "./assets/icon.png",
      supportsTablet: true,
      bundleIdentifier: "com.potholeapp.reporter",
      config: {
        googleMapsApiKey: ""
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a73e8"
      },
      package: "com.potholeapp.reporter",
      config: {
        googleMaps: {
          apiKey: ""
        }
      },
      permissions: [
        "CAMERA",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    },
    extra: {
      API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000/api/v1",
      eas: {
        projectId: "89159326-9c4c-4aa1-9b90-ec49e0852d88"
      }
    }
  }
};

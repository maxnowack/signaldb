---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/troubleshooting/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/troubleshooting/
- - meta
  - name: og:title
    content: Troubleshooting SignalDB - Common Issues and Solutions
- - meta
  - name: og:description
    content: Find solutions for SignalDB issues, from installation and instance creation to data persistence and reactivity challenges, in this troubleshooting guide.
- - meta
  - name: description
    content: Find solutions for SignalDB issues, from installation and instance creation to data persistence and reactivity challenges, in this troubleshooting guide.
- - meta
  - name: keywords
    content: SignalDB, troubleshooting, common issues, installation problems, data persistence, reactivity, error solutions, JavaScript database, SignalDB issues, help, support
---
# Troubleshooting

In this section, we've compiled some common issues you might encounter while using SignalDB and their respective solutions. Keep in mind, that you can always [file an issue](https://github.com/maxnowack/signaldb/issues/new) at our [Github Repository](https://github.com/maxnowack/signaldb).

## Unable to install SignalDB
**Problem:** You may encounter issues during the installation of SignalDB using npm.

**Solution:** Make sure you have Node.js and npm installed correctly on your machine. You can verify this by running node -v and npm -v in your terminal. Both commands should return a version number. If not, you'll need to install Node.js and npm.

## Errors when creating a new SignalDB instance
**Problem:** You may get errors when trying to create a new instance of SignalDB.

**Solution:** Check your configuration object passed into the SignalDB constructor. Ensure that all required properties are present and are of the correct type. If you're using a custom Persistence Adapter or Reactivity Adapter, verify that they correctly implement their respective interfaces.

## Problems with data persistence
**Problem:** You may notice that your data is not persisting across sessions or application reloads.

**Solution:** Verify that you're using a Persistence Adapter and that it's working correctly. Check your adapter's save, load, and delete methods for any errors or unexpected behavior. If you're using a built-in adapter like the localStorage adapter, check if there are any limitations, like storage quotas, that might be affecting your application.

## Issues with reactivity
**Problem:** Reactive queries aren't updating when the data changes.

**Solution:** Check your Reactivity Adapter and ensure it's working correctly. If you're using a custom adapter, ensure that it correctly implements the Reactivity Adapter interface. Make sure the depend and notify methods in your signals are correctly registering dependencies and notifying them when data changes.

## Data not saving to the desired location
**Problem:** Data isn't being saved to the location specified in your Persistence Adapter.

**Solution:** Double-check the implementation of your save method in your Persistence Adapter. Make sure it correctly writes to the intended location.

If you're facing an issue not covered in this guide, please feel free to [raise an issue](https://github.com/maxnowack/signaldb/issues/new) on the SignalDB GitHub page. Include a clear description of your problem, steps to reproduce it, and any error messages you're seeing. The more information you provide, the easier it will be for the community to assist you.

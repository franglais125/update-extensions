
const St = imports.gi.St;
const Main = imports.ui.main;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const Lang = imports.lang;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionSystem = imports.ui.extensionSystem;
const MessageTray = imports.ui.messageTray;
const Mainloop = imports.mainloop;

const REPOSITORY_URL_BASE = 'https://extensions.gnome.org';
const REPOSITORY_URL_UPDATE = REPOSITORY_URL_BASE + '/update-info/';

const THREE_MINUTES =      3 * 60 * 1000; // ms
const TWELVE_HOURS = 12 * 60 * 60 * 1000; // ms

let _httpSession;
let _timeoutId = 0;

let LIST = [];
let batches = 0;
let nBatch = 0;

/* Code based on extensionDownloader.js from Jasper St. Pierre */

/* Forked by franglais125 from
 * https://extensions.gnome.org/extension/797/extension-update-notifier/ */

function init() {
    _httpSession = new Soup.SessionAsync({ ssl_use_system_ca_file: true });

    // See: https://bugzilla.gnome.org/show_bug.cgi?id=655189 for context.
    // _httpSession.add_feature(new Soup.ProxyResolverDefault());
    Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());
}

function openExtensionList() {
    Gio.app_info_launch_default_for_uri('https://extensions.gnome.org/local', global.create_app_launch_context(0, -1));
}

function doNotify() {
    let title = "Extension Updates Available";
    let message = "Some of your installed extensions have updated versions available.\n\n";
    message += LIST.join('\n');//

    let notifSource = new MessageTray.SystemNotificationSource();
    notifSource.createIcon = function() {
        return new St.Icon({ icon_name: 'software-update-available-symbolic' });
    };
    // Take care of note leaving unneeded sources
    notifSource.connect('destroy', function() {notifSource = null;});
    Main.messageTray.add(notifSource);

    let notification = null;
    // We do not want to have multiple notifications stacked
    // instead we will update previous
    if (notifSource.notifications.length == 0) {
        notification = new MessageTray.Notification(notifSource, title, message);
        notification.addAction( _('Show updates') , openExtensionList);
    } else {
        notification = notifSource.notifications[0];
        notification.update( title, message, { clear: true });
    }
    notification.setTransient(false);
    notifSource.notify(notification);
}

function getMetadata(i) {
    let metadatas = {};
    let counter = 0;
    for (let uuid in ExtensionUtils.extensions) {
        if (isValid) {
            counter++;
            if (i*10 <= counter && counter < (i+1)*10)
                metadatas[uuid] = ExtensionUtils.extensions[uuid].metadata;
        }
    }
    return metadatas;
}

function isValid(uuid) {
    let output = typeof ExtensionUtils.extensions[uuid].metadata.version == 'number';
    return output;
}

function checkForUpdates() {
    // Reset batch number and list of updates
    nBatch = 0;
    LIST = [];

    // In groups of 10 or less, not to overload the server
    let countExtensions = 0;
    for (let uuid in ExtensionUtils.extensions)
        if (isValid)
            countExtensions++;

    batches = Math.ceil(countExtensions/10.);

    for (let i = 0; i < batches; i++) {
        // We get batches of 10
        let metadatas = getMetadata(i);
        let params = { shell_version: Config.PACKAGE_VERSION,
                       installed: JSON.stringify(metadatas) };

        let url = REPOSITORY_URL_UPDATE;
        let message = Soup.form_request_new_from_hash('GET', url, params);
        _httpSession.queue_message(message, function(session, message) {

            let operations = JSON.parse(message.response_body.data);
            for (let uuid in operations) {
                let operation = operations[uuid];
                if (operation == 'blacklist')
                    continue;
                else if (operation == 'upgrade' || operation == 'downgrade')
                    LIST.push(ExtensionUtils.extensions[uuid].metadata.name);
            }

            if (hasFinished() && LIST.length > 0) {
                doNotify();
            }
        });


    }


    _timeoutId = 0;
    scheduleCheck(TWELVE_HOURS);
}

function hasFinished() {
    nBatch++;
    return nBatch == batches;
}

function scheduleCheck(timeout) {
    if (_timeoutId != 0) {
        Mainloop.source_remove (_timeoutId);
    }

    _timeoutId = Mainloop.timeout_add(timeout, checkForUpdates);
}

function enable() {
    scheduleCheck(THREE_MINUTES);
}

function disable() {
    if (_timeoutId != 0) {
        Mainloop.source_remove (_timeoutId);
        _timeoutId = 0;
    }
}

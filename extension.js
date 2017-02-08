
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

const THREE_MINUTES = 180 * 1000; // ms
const TWELVE_HOURS = 12 * 3600 * 1000; // ms

let _httpSession;
let _timeoutId = 0;

/* Code based on extensionDownloader.js from Jasper St. Pierre */

function init() {
    _httpSession = new Soup.SessionAsync({ ssl_use_system_ca_file: true });

    // See: https://bugzilla.gnome.org/show_bug.cgi?id=655189 for context.
    // _httpSession.add_feature(new Soup.ProxyResolverDefault());
    Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());
}

function openExtensionList() {
    Gio.app_info_launch_default_for_uri('https://extensions.gnome.org/local', global.create_app_launch_context(0, -1));
}

const ExtensionUpdateNotifier = new Lang.Class({
    Name: 'ExtensionUpdateNotifier',
    Extends: MessageTray.Source,

    _init: function() {
        this.parent('', 'software-update-available');
        Main.messageTray.add(this);
    },

    doNotify: function() {
        let notification = new MessageTray.Notification(this, "Extension Updates Available", "Some of your installed extensions have updated versions available.");
        try {
            notification.addButton('default', "Show Updates");
            notification.connect('action-invoked', openExtensionList);
        }
        catch(e) {
            let button = new St.Button({ can_focus: true });
            button.add_style_class_name('notification-button');
            button.label = "Show Updates";
            notification.addButton(button, openExtensionList);
        }
        this.notify(notification);
    },
});

function isLocal(uuid) {
    let extension = ExtensionUtils.extensions[uuid];
    return extension.path.indexOf(GLib.get_home_dir()) != -1;
}

function checkForUpdates() {
    let metadatas = {};
    for (let uuid in ExtensionUtils.extensions) {
        if (isLocal(uuid))
            metadatas[uuid] = ExtensionUtils.extensions[uuid].metadata;
    }

    let params = { shell_version: Config.PACKAGE_VERSION,
                   installed: JSON.stringify(metadatas) };

    let url = REPOSITORY_URL_UPDATE;
    let message = Soup.form_request_new_from_hash('GET', url, params);
    _httpSession.queue_message(message, function(session, message) {
        if (message.status_code != Soup.KnownStatusCode.OK) {
            scheduleCheck(THREE_MINUTES);
            return;
        }

        let operations = JSON.parse(message.response_body.data);
        let updatesAvailable = false;
        for (let uuid in operations) {
            let operation = operations[uuid];
            if (operation == 'blacklist')
                continue;
            else if (operation == 'upgrade' || operation == 'downgrade')
                updatesAvailable = true;
        }

        if (updatesAvailable) {
            let source = new ExtensionUpdateNotifier();
            source.doNotify();
        }

        scheduleCheck(TWELVE_HOURS);
    });
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

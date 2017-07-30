# Basic Makefile

UUID = update-extensions@franglais125.gmail.com
BASE_MODULES = extension.js prefs.js utils.js metadata.json Settings.ui
TOLOCALIZE = extension.js
INSTALLNAME = update-extensions@franglais125.gmail.com
MSGSRC = $(wildcard po/*.po)
ifeq ($(strip $(DESTDIR)),)
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLBASE = $(DESTDIR)/usr/share/gnome-shell/extensions
endif

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled $(MSGSRC:.po=.mo)

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.update-extensions.gschema.xml
	glib-compile-schemas ./schemas/

potfile: ./po/update-extensions.pot

mergepo: potfile
	for l in $(MSGSRC); do \
		msgmerge -U $$l ./po/update-extensions.pot; \
	done;

./po/update-extensions.pot: $(TOLOCALIZE) Settings.ui
	mkdir -p po
	xgettext -k_ -kN_ -o po/update-extensions.pot --package-name "Extension Update Notifier" $(TOLOCALIZE)
	intltool-extract --type=gettext/glade Settings.ui
	xgettext -k_ -kN_ --join-existing -o po/update-extensions.pot Settings.ui.h

./po/%.mo: ./po/%.po
	msgfmt -c $< -o $@

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r ./_build/* $(INSTALLBASE)/$(INSTALLNAME)/
	-rm -fR _build
	echo done

zip-file: _build
	cd _build ; \
	zip -qr "$(UUID)$(VSTRING).zip" .
	mv _build/$(UUID)$(VSTRING).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build
	mkdir -p _build
	cp $(BASE_MODULES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
	mkdir -p _build/locale
	for l in $(MSGSRC:.po=.mo) ; do \
		lf=_build/locale/`basename $$l .mo`; \
		mkdir -p $$lf; \
		mkdir -p $$lf/LC_MESSAGES; \
		cp $$l $$lf/LC_MESSAGES/update-extensions.mo; \
	done;

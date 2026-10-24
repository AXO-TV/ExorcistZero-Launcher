/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
"use strict";

import { logger, database, changePanel, t } from "../utils.js";
const { Launch, Status } = require("minecraft-java-core-azbetter");
const { ipcRenderer, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const launch = new Launch();
const pkg = require("../package.json");
const settings_url = pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings;
const nodeFetch = require("node-fetch");
const net = require("net");
const dns = require("dns").promises;
const crypto = require("crypto");

// Liens du serveur (modifiables ici)
const SITE_URL = "https://exorcist-zero.x10.mx/";
const DISCORD_URL = "https://discord.gg/Gx8z7Bftch";
// Pages du site affichées dans le launcher
const NOTIFICATIONS_URL = `${SITE_URL}notifications`;
const FORUM_URL = `${SITE_URL}forum`;
const WIKI_URL = `${SITE_URL}wiki`;
const SUPPORT_URL = `${SITE_URL}support/tickets`;
const CHANGELOG_URL = `${SITE_URL}changelog`;
const CENSUS_URL = `${SITE_URL}census`;
const NEWS_URL = `${SITE_URL}news`;
const CHANGELOG_SLOTS = 3;

const dataDirectory =
  process.env.APPDATA ||
  (process.platform == "darwin"
    ? `${process.env.HOME}/Library/Application Support`
    : process.env.HOME);
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

class Home {
  static id = "home";

  async init(config, news) {
    this.database = await new database().init();
    this.config = config;
    this.news = await news;

    console.log("[Theme] Accueil Exorcist Zero v10 chargé");
    // Remplacé par initSitePanels() : ouvre une page du site dans le launcher
    this.openInLauncher = (url) => shell.openExternal(url);
    // Chaque bloc est isolé : une erreur dans l'un n'empêche jamais les autres de fonctionner
    const safe = (name, fn) => {
      try {
        const r = fn();
        if (r && typeof r.catch === "function") {
          r.catch((e) => console.error(`[Accueil] ${name} :`, e));
        }
      } catch (e) {
        console.error(`[Accueil] ${name} :`, e);
      }
    };
    safe("textes", () => this.setStaticTexts());
    safe("actualité", () => this.initNews());
    safe("en-tête serveur", () => this.initHero());
    safe("patch-notes", () => this.initChangelog());
    safe("boutons latéraux", () => this.initSideLinks());
    safe("lancement", () => this.initLaunch());
    safe("statut serveur", () => this.initStatusServer());
    safe("paramètres", () => this.initBtn());
    safe("vidéo", () => this.initVideo());
    safe("annonce", () => this.initAdvert());
    safe("vérification des mods", () => this.verifyModsBeforeLaunch());
    safe("synchronisation du skin", () => this.initSkinSync());
    safe("recensement", () => this.initCensus());
  }

  setStaticTexts() {
    document.getElementById("play-btn").title = t("play");
    document.getElementById("text-download").textContent = t("verification");
    document.getElementById("server-name").textContent = t("offline");
    document.getElementById("server-desc").innerHTML =
      `<span class="red">${t("closed")}</span>`;
    document.getElementById("video-title").textContent = t("community_video");
    document.getElementById("play-video-btn").innerHTML = "&#9658;";
  }

  async initNews() {
    const newsContainer = document.querySelector(".news-list");
    if (this.news) {
      if (!this.news.length) {
        this.createNewsBlock(
          newsContainer,
          t("no_news_available"),
          t("news_follow_here"),
        );
      } else {
        const newsItem = await this.getFeaturedNews();
        const date = await this.getDate(newsItem.publish_date);
        this.createNewsBlock(
          newsContainer,
          newsItem.title,
          this.toPlainText(newsItem.content, 220),
          newsItem.author,
          date,
          newsItem.image,
          newsItem.link,
        );
      }
    } else {
      this.createNewsBlock(
        newsContainer,
        t("error_contacting_server"),
        t("error_contacting_server"),
      );
    }
    this.setServerIcon();
  }

  // Actualité épinglée si le site en met une en premier, sinon la plus récente
  async getFeaturedNews() {
    const byDate = [...this.news].sort(
      (a, b) => new Date(b.publish_date) - new Date(a.publish_date),
    );
    try {
      const res = await nodeFetch(NEWS_URL, { timeout: 5000 });
      const html = await res.text();
      const match = html.match(/href="[^"]*\/news\/([^"\/?#]+)"/i);
      if (match) {
        const pinned = this.news.find(
          (n) => n.link && n.link.includes(`/news/${match[1]}`),
        );
        if (pinned) return pinned;
      }
    } catch (e) {
      console.warn("[News] Page des actualités injoignable :", e.message);
    }
    return byDate[0];
  }

  toPlainText(html, max = 160) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }

  escapeHtml(str) {
    return String(str ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }

  createNewsBlock(
    container,
    title,
    content,
    author = "",
    date = {},
    image = null,
    link = null,
  ) {
    const rawTitle = title;
    title = this.escapeHtml(title);
    content = this.escapeHtml(content);
    author = this.escapeHtml(author);
    const blockNews = document.createElement("div");
    blockNews.classList.add("news-block", "opacity-1", "news-compact");
    if (link) {
      blockNews.classList.add("is-link");
      blockNews.addEventListener("click", () => this.openInLauncher(link, rawTitle));
    }
    blockNews.innerHTML = `
            <div class="news-header">
                <div class="header-text">
                    <div class="title">${title}</div>
                </div>
                ${date.day ? `<div class="date"><div class="day">${date.day}</div><div class="month">${date.month}</div></div>` : ""}
            </div>
            ${image ? `<div class="news-image" style="background-image: url('${image}');"></div>` : ""}
            <div class="news-content">
                <div class="bbWrapper">
                    <p>${content}</p>
                    ${author ? `<p class="news-author"><span>${author}</span></p>` : ""}
                </div>
            </div>`;
    container.appendChild(blockNews);
  }

  setServerIcon() {
    const serverImg = document.querySelector(".server-img");
    serverImg.setAttribute("src", this.config.server_icon);
    if (!this.config.server_icon) {
      serverImg.style.display = "none";
    }
  }

  async initLaunch() {
    document.querySelector(".play-btn").addEventListener("click", async () => {
      await this.verifyModsBeforeLaunch();
      const opts = await this.getLaunchOptions();
      const playBtn = document.querySelector(".play-btn");
      const info = document.querySelector(".text-download");
      const progressBar = document.querySelector(".progress-bar");

      playBtn.style.display = "none";
      info.style.display = "block";
      launch.Launch(opts);

      const launcherSettings = (await this.database.get("1234", "launcher"))
        .value;
      this.setupLaunchListeners(
        launch,
        info,
        progressBar,
        playBtn,
        launcherSettings,
      );
    });
  }

  async getLaunchOptions() {
    const urlpkg = this.getBaseUrl();
    const uuid = (await this.database.get("1234", "accounts-selected")).value;
    const account = (await this.database.get(uuid.selected, "accounts")).value;
    const ram = (await this.database.get("1234", "ram")).value;
    const javaPath = (await this.database.get("1234", "java-path")).value;
    const javaArgs = (await this.database.get("1234", "java-args")).value;
    const resolution = (await this.database.get("1234", "screen")).value;
    const launcherSettings = (await this.database.get("1234", "launcher"))
      .value;

    const screen =
      resolution.screen.width === "<auto>"
        ? false
        : { width: resolution.screen.width, height: resolution.screen.height };

    // CentralCorp excludes the root Minecraft options.txt in the server manifest.
    // Do not pass that basename to minecraft-java-core's ignored list: the core
    // may also match config/fancymenu/options.txt and prevent FancyMenu settings
    // from being refreshed. Other configured ignore entries remain unchanged.
    const configuredIgnored = Array.isArray(this.config.ignored)
      ? [...this.config.ignored]
      : Object.values(this.config.ignored || {});
    const ignoredForCore = configuredIgnored.filter((entry) => {
      const normalized = String(entry).replace(/\\/g, "/").replace(/\/$/, "");
      return normalized.toLowerCase() !== "options.txt";
    });

    return {
      url: urlpkg,
      authenticator: account,
      timeout: 10000,
      path: `${dataDirectory}/${process.platform == "darwin" ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
      version: this.config.game_version,
      detached: launcherSettings.launcher.close === "close-all" ? false : true,
      downloadFileMultiple: 30,
      loader: {
        type: this.config.loader.type,
        build: this.config.loader.build,
        enable: this.config.loader.enable,
      },
      verify: this.config.verify,
      ignored: [
  ...(Array.isArray(this.config.ignored)
    ? this.config.ignored
    : Object.values(this.config.ignored || {})),
  "launcher_config",
],
      intelEnabledMac:
        process.platform === "darwin" && process.arch === "arm64",
      downloadFileMultiple: 30,
      JVM_ARGS: ["--enable-native-access=ALL-UNNAMED"],
      GAME_ARGS: [],
      java: this.config.java,
      memory: {
        min: `${ram.ramMin * 1024}M`,
        max: `${ram.ramMax * 1024}M`,
      },
    };
  }

  getBaseUrl() {
    const baseUrl = settings_url.endsWith("/")
      ? settings_url
      : `${settings_url}/`;
    return pkg.env === "azuriom"
      ? `${baseUrl}api/centralcorp/files`
      : `${baseUrl}data/`;
  }

  setupLaunchListeners(launch, info, progressBar, playBtn, launcherSettings) {
    launch.on("extract", (extract) => console.log(extract));
    launch.on("progress", (progress, size) =>
      this.updateProgressBar(progressBar, info, progress, size, t("download")),
    );
    launch.on("check", (progress, size) =>
      this.updateProgressBar(
        progressBar,
        info,
        progress,
        size,
        t("verification"),
      ),
    );
    launch.on("estimated", (time) => console.log(this.formatTime(time)));
    launch.on("speed", (speed) =>
      console.log(`${(speed / 1067008).toFixed(2)} Mb/s`),
    );
    launch.on("patch", (patch) => (info.innerHTML = t("patch_in_progress")));
    launch.on("data", (e) =>
      this.handleLaunchData(e, info, progressBar, playBtn, launcherSettings),
    );
    launch.on("close", (code) =>
      this.handleLaunchClose(
        code,
        info,
        progressBar,
        playBtn,
        launcherSettings,
      ),
    );
    launch.on("error", (err) => console.log(err));
  }

  updateProgressBar(progressBar, info, progress, size, text) {
    progressBar.style.display = "block";
    const percent = ((progress / size) * 100).toFixed(0);
    info.innerHTML = `<span class="dl-label">${text}</span><span class="dl-percent">${percent}%</span>`;
    ipcRenderer.send("main-window-progress", { progress, size });
    progressBar.value = progress;
    progressBar.max = size;
  }

  formatTime(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time - hours * 3600) / 60);
    const seconds = Math.floor(time - hours * 3600 - minutes * 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  handleLaunchData(e, info, progressBar, playBtn, launcherSettings) {
    new logger("Minecraft", "#36b030");
    if (launcherSettings.launcher.close === "close-launcher")
      ipcRenderer.send("main-window-hide");
    ipcRenderer.send("main-window-progress-reset");
    progressBar.style.display = "none";
    info.innerHTML = t("starting");
    console.log(e);
  }

  handleLaunchClose(code, info, progressBar, playBtn, launcherSettings) {
    if (launcherSettings.launcher.close === "close-launcher")
      ipcRenderer.send("main-window-show");
    progressBar.style.display = "none";
    info.style.display = "none";
    playBtn.style.display = "block";
    info.innerHTML = t("verification");
    new logger("Launcher", "#7289da");
    console.log("Close");
  }

  // Ping "Server List Ping" du protocole Minecraft (sans service tiers)
  pingMinecraft(host, port, timeout = 5000) {
    const varInt = (n) => {
      const out = [];
      do {
        let b = n & 0x7f;
        n >>>= 7;
        if (n) b |= 0x80;
        out.push(b);
      } while (n);
      return Buffer.from(out);
    };
    const readVarInt = (buf, offset) => {
      let val = 0, size = 0, b;
      do {
        if (offset + size >= buf.length) return null;
        b = buf[offset + size];
        val |= (b & 0x7f) << (7 * size);
        size++;
        if (size > 5) throw new Error("VarInt trop long");
      } while (b & 0x80);
      return { val, size };
    };
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      let data = Buffer.alloc(0);
      const done = (fn, v) => { clearTimeout(timer); socket.destroy(); fn(v); };
      const timer = setTimeout(() => done(reject, new Error("timeout")), timeout);
      socket.on("error", (e) => done(reject, e));
      socket.on("connect", () => {
        const hostBuf = Buffer.from(host, "utf8");
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(port);
        const body = Buffer.concat([varInt(0), varInt(765), varInt(hostBuf.length), hostBuf, portBuf, varInt(1)]);
        socket.write(Buffer.concat([varInt(body.length), body]));
        socket.write(Buffer.from([1, 0]));
      });
      socket.on("data", (chunk) => {
        data = Buffer.concat([data, chunk]);
        try {
          const len = readVarInt(data, 0);
          if (!len || data.length < len.size + len.val) return;
          let o = len.size;
          const id = readVarInt(data, o); o += id.size;
          const strLen = readVarInt(data, o); o += strLen.size;
          if (data.length < o + strLen.val) return;
          const json = JSON.parse(data.toString("utf8", o, o + strLen.val));
          done(resolve, json);
        } catch (e) {
          if (!(e instanceof RangeError)) done(reject, e);
        }
      });
    });
  }

  // Nettoie l'adresse saisie dans le panel ("play.exemple.fr:25565", "minecraft://…", espaces…)
  normalizeAddress(ip, port) {
    let host = String(ip ?? "").trim().replace(/^[a-z]+:\/\//i, "").replace(/[\/?#].*$/, "");
    let p = parseInt(port, 10) || 0;
    const m = host.match(/^(.+):(\d{1,5})$/);
    if (m && !host.includes("::")) {
      host = m[1];
      if (!p) p = parseInt(m[2], 10);
    }
    return { host, port: p };
  }

  async resolveServerAddress(ip, port) {
    const { host, port: p } = this.normalizeAddress(ip, port);
    if (!host) throw new Error("adresse du serveur non renseignée dans le panel");
    if (p) return { host, port: p };
    try {
      const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srv && srv.length) return { host: srv[0].name, port: srv[0].port };
    } catch (e) { /* pas d'enregistrement SRV */ }
    return { host, port: 25565 };
  }

  async initStatusServer() {
    const nameServer = document.querySelector(".server-text .name");
    const serverMs = document.querySelector(".server-text .desc");
    const playersConnected = document.querySelector(".etat-text .text");
    const online = document.querySelector(".etat-text .online");
    const bubble = document.querySelector(".server");

    const status = this.config.status || {};
    let lastError = "";

    const setOffline = () => {
      nameServer.textContent = t("server_unavailable");
      serverMs.innerHTML = `<span class="red">${t("server_closed")}</span>`;
      playersConnected.textContent = "0";
      online.classList.add("off");
      this.setHeroOnline(false, 0);
      if (bubble) bubble.title = lastError;
    };

    const setOnline = (onlinePlayers, maxPlayers, via) => {
      nameServer.textContent = status.nameServer;
      serverMs.innerHTML = `<span class="green">${t("server_online")}</span>`;
      online.classList.remove("off");
      playersConnected.textContent = maxPlayers
        ? `${onlinePlayers}/${maxPlayers}`
        : `${onlinePlayers}`;
      this.setHeroOnline(true, onlinePlayers);
      if (bubble) bubble.title = via;
    };

    const check = async () => {
      let target = null;
      // 1) ping direct du serveur
      try {
        target = await this.resolveServerAddress(status.ip, status.port);
        const res = await this.pingMinecraft(target.host, target.port);
        console.log("[Status] Ping direct OK", target, res.players);
        setOnline(res.players?.online ?? 0, res.players?.max, `Ping direct ${target.host}:${target.port}`);
        return;
      } catch (e) {
        const where = target ? `${target.host}:${target.port}` : `${status.ip}:${status.port}`;
        lastError = `Ping direct ${where} impossible : ${e.code || e.message}`;
        console.warn("[Status]", lastError);
      }

      // 2) secours : API publique mcsrvstat
      try {
        const address = target ? `${target.host}:${target.port}` : String(status.ip || "");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(
          `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);
        const data = response.ok ? await response.json() : null;
        if (data && data.online) {
          setOnline(data.players?.online ?? 0, data.players?.max, `mcsrvstat ${address}`);
          return;
        }
        lastError += ` | mcsrvstat : ${data ? "hors ligne" : "HTTP " + response.status}`;
      } catch (e) {
        lastError += ` | mcsrvstat injoignable : ${e.message}`;
      }
      console.warn("[Status] Serveur considéré hors ligne.", lastError);
      setOffline();
    };

    await check();
    // actualisation automatique toutes les 30 s
    this.statusTimer = setInterval(() => check().catch(() => {}), 30000);
  }

  async initVideo() {
    const videoContainer = document.querySelector(".ytb");
    if (!this.config.video_activate) {
      videoContainer.style.display = "none";
      return;
    }

    const youtubeVideoId = this.config.video_url;
    const videoType = this.config.video_type;
    const youtubeThumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    const videoThumbnail = videoContainer.querySelector(".youtube-thumbnail");
    const thumbnailImg = videoThumbnail.querySelector(".thumbnail-img");

    if (thumbnailImg) {
      thumbnailImg.src = youtubeThumbnailUrl;
      videoThumbnail.addEventListener(
        "click",
        () => {
          // Lecture dans le launcher : un <webview> envoie un référent valide à YouTube
          // (un simple iframe sur une page locale provoque l'erreur 153 / "configuration du lecteur").
          videoThumbnail.classList.add("playing");
          videoThumbnail.innerHTML = "";
          const player = document.createElement("webview");
          player.setAttribute("partition", "persist:ez-youtube");
          player.setAttribute("httpreferrer", SITE_URL);
          player.setAttribute(
            "src",
            `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?autoplay=1&rel=0&playsinline=1`,
          );
          player.setAttribute("allowfullscreen", "");
          videoThumbnail.appendChild(player);
        },
        { once: true },
      );
    }
  }

  async initAdvert() {
    const advertBanner = document.querySelector(".advert-banner");
    if (this.config.alert_activate) {
      const message = this.config.alert_msg;
      const firstParagraph = message.split("</p>")[0] + "</p>";
      const scrollingText = document.createElement("div");
      scrollingText.classList.add("scrolling-text");
      scrollingText.innerHTML = `${firstParagraph}`;
      advertBanner.innerHTML = "";
      advertBanner.appendChild(scrollingText);
      scrollingText.classList.toggle("no-scroll", !this.config.alert_scroll);
      advertBanner.style.display = "block";
    } else {
      advertBanner.style.display = "none";
    }
  }

  setHeroOnline(isOnline, count) {
    const dot = document.getElementById("hero-online-dot");
    const text = document.getElementById("hero-online-text");
    if (!dot || !text) return;
    dot.classList.toggle("off", !isOnline);
    text.textContent = isOnline ? `${count} ${t("online_count")}` : t("offline_label");
  }

  async initHero() {
    const status = (this.config && this.config.status) || {};
    document.getElementById("hero-title").textContent = status.nameServer || "Exorcist Zero";
    document.getElementById("hero-subtitle").textContent = t("hero_subtitle");
    this.setHeroOnline(false, 0);
    // Version RP affichée sur le site ("Roleplay · 26.3"), si elle est lisible
    try {
      const res = await nodeFetch(SITE_URL, { timeout: 5000 });
      const html = await res.text();
      const m = html.match(/Roleplay\s*(?:·|&middot;|&#183;)\s*([\w.\-]+)/i);
      if (m) document.getElementById("hero-eyebrow").textContent = `Roleplay · ${m[1]}`;
    } catch (e) {
      console.warn("[Hero] Version du site illisible :", e.message);
    }
  }

  // Pages du site (notifications, forum, wiki, support) affichées dans le launcher.
  // La session du site est conservée : il suffit de s'y connecter une fois.
  initSitePanels() {
    const overlay = document.getElementById("notif-overlay");
    const body = document.getElementById("notif-body");
    const title = document.getElementById("notif-title");
    if (!overlay || !body || !title) {
      console.warn("[Pages du site] panels/home.html n'est pas à jour : remplace tout le dossier src.");
      return;
    }
    const chromeAll = "header, nav, footer { display: none !important; } body { margin: 0; }";
    const chromeTop = "body > header, body > nav, .navbar, footer { display: none !important; } body { margin: 0; }";
    const pages = {
      notif: { btn: "notif-btn", url: NOTIFICATIONS_URL, label: "notifications", css: chromeAll },
      forum: { btn: "forum-btn", url: FORUM_URL, label: "forum", css: chromeTop },
      wiki: { btn: "wiki-btn", url: WIKI_URL, label: "wiki", css: chromeTop },
      support: { btn: "support-btn", url: SUPPORT_URL, label: "support", css: chromeTop },
      article: { btn: null, url: SITE_URL, label: "", css: chromeTop },
    };
    const views = {};
    let current = null;

    const show = (key) => {
      const page = pages[key];
      overlay.hidden = false;
      current = key;
      title.textContent = page.titleText || t(page.label);
      Object.entries(pages).forEach(([k, p]) => {
        const b = p.btn && document.getElementById(p.btn);
        if (b) b.classList.toggle("is-active", k === key);
        if (views[k]) views[k].style.display = k === key ? "" : "none";
      });
      if (!views[key]) {
        const view = document.createElement("webview");
        view.setAttribute("partition", "persist:exorcist-site");
        view.setAttribute("src", page.url);
        view.classList.add("notif-view");
        view.addEventListener("dom-ready", () => view.insertCSS(page.css));
        view.addEventListener("did-fail-load", (e) => {
          if (e.errorCode === -3 || !e.isMainFrame) return;
          view.style.display = "none";
          const err = document.createElement("div");
          err.className = "notif-error";
          err.textContent = t("notifications_error");
          body.appendChild(err);
        });
        body.appendChild(view);
        views[key] = view;
      }
    };
    const close = () => {
      overlay.hidden = true;
      current = null;
      Object.values(pages).forEach((p) => {
        const b = p.btn && document.getElementById(p.btn);
        if (b) b.classList.remove("is-active");
      });
      this.syncSkin().catch(() => {}); // le skin a pu être changé sur le site
      this.refreshCensus().catch(() => {}); // le recensement aussi
    };

    // Ouvre une adresse du site (article, changelog…) dans le launcher
    this.openInLauncher = (url, titleText = "") => {
      if (!/^https?:\/\//i.test(url)) return;
      pages.article.url = url;
      pages.article.titleText = titleText;
      if (views.article) views.article.setAttribute("src", url);
      show("article");
    };

    Object.entries(pages).forEach(([key, page]) => {
      const b = page.btn && document.getElementById(page.btn);
      if (!b) return;
      b.title = t(page.label);
      b.addEventListener("click", () => (current === key ? close() : show(key)));
    });
    document.getElementById("notif-close").addEventListener("click", close);
    const ext = document.getElementById("notif-external");
    if (ext) {
      ext.title = t("open_in_browser");
      ext.addEventListener("click", () => {
        const v = views[current];
        if (v) shell.openExternal(v.getURL());
      });
    }
    document.getElementById("notif-reload").addEventListener("click", () => {
      const v = views[current];
      if (v) v.reload();
    });
    document.getElementById("notif-back").addEventListener("click", () => {
      const v = views[current];
      if (v && v.canGoBack()) v.goBack();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  // ----- Skin : le launcher suit le skin enregistré sur le site (Skin API) -----
  getSiteAuthUrl() {
    const base = settings_url.endsWith("/") ? settings_url : `${settings_url}/`;
    if (pkg.env === "azuriom") return base;
    const az = String(this.config.azauth || "");
    return az.endsWith("/") ? az : `${az}/`;
  }

  async initSkinSync() {
    this.skinHash = this.skinHash || {};
    await this.syncSkin();
    this.skinTimer = setInterval(() => this.syncSkin().catch(() => {}), 30000);
    window.addEventListener("focus", () => this.syncSkin().catch(() => {}));
  }

  async syncSkin() {
    const selected = (await this.database.get("1234", "accounts-selected"))?.value;
    if (!selected || !selected.selected) return;
    const account = (await this.database.get(selected.selected, "accounts"))?.value;
    if (!account || !account.name) return;

    this.skinHash = this.skinHash || {};
    const azauth = this.getSiteAuthUrl();
    const name = encodeURIComponent(account.name);
    // empreinte de l'avatar actuel sur le site : on ne recharge que si le skin a changé
    const res = await nodeFetch(`${azauth}api/skin-api/avatars/face/${name}/?t=${Date.now()}`, { timeout: 8000 });
    if (!res.ok) return;
    const hash = crypto.createHash("md5").update(await res.buffer()).digest("hex");
    if (this.skinHash[account.name] === hash) return;
    const first = !(account.name in this.skinHash);
    this.skinHash[account.name] = hash;
    console.log(`[Skin] ${first ? "Skin chargé" : "Nouveau skin détecté sur le site"} pour ${account.name}`);

    const ts = Date.now();
    const faceUrl = `${azauth}api/skin-api/avatars/face/${name}/?t=${ts}`;
    const head = document.querySelector(".player-head");
    if (head) head.style.backgroundImage = `url(${faceUrl})`;
    document.querySelectorAll(".account-image").forEach((img) => {
      if ((img.getAttribute("src") || "").includes(`/face/${name}/`)) img.src = faceUrl;
    });
    const render = document.querySelector(".skin-renderer-settings");
    if (render) render.src = `${azauth}skin3d/3d-api/skin-api/${name}?t=${ts}`;
  }

  // ----- Recensement du joueur : lu depuis la page /census du site (session du site) -----
  async initCensus() {
    document.getElementById("census-title").textContent = t("census_title");
    const open = () => this.openInLauncher(CENSUS_URL, t("census_title"));
    document.getElementById("census-open").addEventListener("click", open);
    document.getElementById("census-body").addEventListener("click", open);
    this.renderCensus([], t("census_loading"));
    await this.refreshCensus();
    this.censusTimer = setInterval(() => this.refreshCensus().catch(() => {}), 5 * 60 * 1000);
    window.addEventListener("focus", () => this.refreshCensus().catch(() => {}));
  }

  renderCensus(rows, message = "", image = null) {
    const body = document.getElementById("census-body");
    if (!body) return;
    const esc = (v) => this.escapeHtml(v);
    if (!rows.length) {
      body.innerHTML = `<div class="census-empty">${esc(message)}</div>`;
      return;
    }
    const plain = rows.every((r) => !r.label);
    let html;
    if (plain) {
      // fiche de type carte : nom, technique, clan (pastille) et détails
      const [name, ...rest] = rows.map((r) => r.value);
      const isBadge = (v) => /^(clan|affiliation|famille|family)\b/i.test(v);
      const tech = rest.filter((v) => !isBadge(v) && !/\d+\s*(tirage|roll)/i.test(v));
      const badge = rest.filter(isBadge);
      const muted = rest.filter((v) => !isBadge(v) && !tech.includes(v));
      html = `
        <div class="cn-name">${esc(name)}</div>
        ${tech.map((v) => `<div class="cn-tech">${esc(v)}</div>`).join("")}
        <div class="cn-meta">${badge.map((v) => `<span class="cn-badge">${esc(v)}</span>`).join("")}${muted.map((v) => `<span class="cn-muted">${esc(v)}</span>`).join("")}</div>`;
    } else {
      html = rows
        .map((r) => `<div class="census-row"><span class="census-label">${esc(r.label)}</span><span class="census-value">${esc(r.value)}</span></div>`)
        .join("");
    }
    body.innerHTML = `<div class="census-profile">${
      image ? `<img class="census-avatar" src="${esc(image)}" alt="" onerror="this.style.display='none'">` : ""
    }<div class="census-lines">${html}</div></div>`;
  }

  async refreshCensus() {
    if (this.censusBusy) return;
    this.censusBusy = true;
    try {
      const selected = (await this.database.get("1234", "accounts-selected"))?.value;
      const account = selected && selected.selected
        ? (await this.database.get(selected.selected, "accounts"))?.value
        : null;
      if (!account || !account.name) {
        this.renderCensus([], t("census_empty"));
        return;
      }
      const page = await this.fetchSitePage(CENSUS_URL);
      if (page.loggedOut) {
        this.renderCensus([], t("census_login"));
        return;
      }
      const found = this.extractCensus(page.html, account.name);
      console.log("[Recensement] lignes trouvées :", JSON.stringify(found));
      this.renderCensus(found.rows, t("census_empty"), found.image);
    } catch (e) {
      console.warn("[Recensement] Lecture impossible :", e.message);
      this.renderCensus([], t("census_empty"));
    } finally {
      this.censusBusy = false;
    }
  }

  // Charge une page du site avec la session du launcher (webview caché) et renvoie son HTML
  fetchSitePage(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const view = document.createElement("webview");
      view.setAttribute("partition", "persist:exorcist-site");
      view.setAttribute("src", url);
      view.style.cssText = "position:fixed;left:-10000px;top:0;width:1024px;height:768px;";
      const finish = (fn, v) => {
        clearTimeout(timer);
        view.remove();
        fn(v);
      };
      const timer = setTimeout(() => finish(reject, new Error("délai dépassé")), timeout);
      view.addEventListener("did-fail-load", (e) => {
        if (e.isMainFrame && e.errorCode !== -3) finish(reject, new Error(e.errorDescription || "échec du chargement"));
      });
      view.addEventListener("did-finish-load", async () => {
        try {
          await new Promise((r) => setTimeout(r, 400));
          const finalUrl = view.getURL();
          const html = await view.executeJavaScript("document.documentElement.outerHTML");
          finish(resolve, { html, url: finalUrl, loggedOut: /\/(user\/)?login/i.test(finalUrl) });
        } catch (e) {
          finish(reject, e);
        }
      });
      document.body.appendChild(view);
    });
  }

  // Extrait la fiche du joueur depuis le HTML de la page : { rows, image }
  extractCensus(html, playerName) {
    const clean = (txt) => (txt || "").replace(/\s+/g, " ").trim();
    // Pseudo "stylisé" (卂乂ㄖ, 𝓐𝓧𝓞, ＡＸＯ…) -> lettres latines pour la comparaison
    const LOOK = {
      "卂": "a", "乃": "b", "匚": "c", "刀": "d", "乇": "e", "下": "f", "厶": "g", "卄": "h", "工": "i", "丁": "j",
      "長": "k", "乚": "l", "从": "m", "𠘨": "n", "ㄖ": "o", "卩": "p", "尸": "q", "尺": "r", "丂": "s", "丅": "t",
      "凵": "u", "ᐯ": "v", "山": "w", "乂": "x", "ㄚ": "y", "乙": "z",
    };
    const fold = (str) =>
      Array.from(String(str || "").normalize("NFKC"))
        .map((c) => LOOK[c] || c)
        .join("")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const key = fold(playerName);
    const has = (el) => !!key && fold(el.textContent).includes(key);

    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,nav,header,footer,form,button,select,option,.navbar").forEach((n) => n.remove());
    const root = doc.querySelector("main") || doc.body;
    const uniq = (rows) => {
      const seen = new Set();
      return rows.filter((r) => {
        const k = `${r.label}|${r.value}`;
        if (!r.value || r.value.length > 120 || r.label.length > 40 || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const imageOf = (el) => {
      let src = null;
      const img = el.querySelector("img");
      if (img) src = img.getAttribute("src") || img.getAttribute("data-src");
      if (!src) {
        const bg = el.querySelector('[style*="url("]');
        const m = bg && (bg.getAttribute("style") || "").match(/url\(["']?([^"')]+)["']?\)/);
        if (m) src = m[1];
      }
      if (!src) return null;
      try { return new URL(src, SITE_URL).href; } catch (e) { return null; }
    };

    // champs "libellé / valeur" : dl, tableaux à 2 colonnes, "Libellé : valeur"
    const pairsOf = (el) => {
      const rows = [];
      el.querySelectorAll("dt").forEach((dt) => {
        const dd = dt.nextElementSibling;
        if (dd) rows.push({ label: clean(dt.textContent).replace(/:$/, ""), value: clean(dd.textContent) });
      });
      el.querySelectorAll("tr").forEach((tr) => {
        const c = tr.querySelectorAll("th,td");
        if (c.length === 2) rows.push({ label: clean(c[0].textContent).replace(/:$/, ""), value: clean(c[1].textContent) });
      });
      el.querySelectorAll("p,li,div,span").forEach((n) => {
        if (n.children.length > 3) return;
        const m = clean(n.textContent).match(/^([^:]{2,30}):\s*(.{1,100})$/);
        if (m) rows.push({ label: m[1].trim(), value: m[2].trim() });
      });
      return uniq(rows);
    };

    // lignes de texte d'une carte (nom, technique, clan, tirages…), dans l'ordre d'affichage
    const leafRows = (el) => {
      const texts = [];
      const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = clean(n.nodeValue);
        if (v) texts.push(v);
      }
      const merged = [];
      texts.forEach((v) => {
        // une icône / un emoji isolé est rattaché au texte suivant
        if (merged.length && merged[merged.length - 1].length <= 2 && /^[^\p{L}\p{N}]*$/u.test(merged[merged.length - 1])) {
          merged[merged.length - 1] += ` ${v}`;
        } else merged.push(v);
      });
      return uniq(merged.map((v) => ({ label: "", value: v })));
    };

    // 1) ligne de tableau contenant le pseudo
    const tr = [...root.querySelectorAll("tr")].find((r) => r.querySelector("td") && has(r));
    if (tr) {
      const table = tr.closest("table");
      const heads = [...(table ? table.querySelectorAll("thead th, tr:first-child th") : [])].map((h) => clean(h.textContent));
      const rows = uniq([...tr.querySelectorAll("td,th")].map((c, i) => ({ label: heads[i] || "", value: clean(c.textContent) })));
      if (rows.length) return { rows: rows.slice(0, 6), image: imageOf(tr) };
    }

    // 2) carte contenant le pseudo : on part du plus petit élément qui le contient,
    //    puis on remonte jusqu'à la carte complète (avatar + lignes), sans englober
    //    les filtres, les titres de section ni les autres joueurs.
    const named = [...root.querySelectorAll("*")]
      .filter((e) => has(e) && clean(e.textContent).length < 900)
      .sort((x, y) => x.textContent.length - y.textContent.length);
    if (named.length) {
      let card = named[0];
      const looksComplete = (el) => !!el.querySelector('img, [style*="url("]') && leafRows(el).length >= 3;
      for (let i = 0; i < 8 && !looksComplete(card); i++) {
        const par = card.parentElement;
        if (!par || par === root || par === doc.body) break;
        if (clean(par.textContent).length > 900) break;
        if (par.querySelector("summary, details, input, select, h1")) break;
        const similar = [...par.children].filter((c) => c.tagName === card.tagName && c.className === card.className && c.querySelectorAll("*").length >= 4);
        if (similar.length > 1) break; // plusieurs cartes côte à côte : on reste sur la nôtre
        card = par;
      }
      const pairs = pairsOf(card);
      const rows = pairs.length >= 2 ? pairs : leafRows(card);
      if (rows.length) return { rows: rows.slice(0, 6), image: imageOf(card) };
    }

    // 3) page "ma fiche" (une seule fiche, pas une liste de joueurs)
    const manyRows = root.querySelectorAll("tbody tr").length > 1;
    if (!manyRows && key.length > 0) {
      const rows = pairsOf(root);
      if (rows.length >= 2) return { rows: rows.slice(0, 6), image: imageOf(root) };
    }
    return { rows: [], image: null };
  }

  initSideLinks() {
    const bind = (id, url, key) => {
      const el = document.getElementById(id);
      el.title = t(key);
      el.addEventListener("click", () => shell.openExternal(url));
    };
    this.initSitePanels();
    bind("discord-btn", DISCORD_URL, "discord");
    bind("web-btn", SITE_URL, "website");
  }

  // Patch-notes : lus depuis la page /changelog du site (3 dernières entrées)
  async initChangelog() {
    document.getElementById("changelog-title").textContent = t("changelog_title");
    const list = document.getElementById("changelog-list");
    let entries = [];
    try {
      entries = await this.fetchChangelog();
    } catch (e) {
      console.warn("[Changelog] Lecture impossible :", e.message);
    }
    list.innerHTML = "";
    if (!entries.length) {
      for (let i = 0; i < CHANGELOG_SLOTS; i++) {
        list.appendChild(this.createChangelogCard(t("changelog_title"), t("changelog_empty"), "", true));
      }
      return;
    }
    entries.slice(0, CHANGELOG_SLOTS).forEach((e) =>
      list.appendChild(this.createChangelogCard(e.title, e.body, e.date, false)),
    );
  }

  createChangelogCard(title, body, date, empty) {
    const card = document.createElement("div");
    card.classList.add("news-block", "opacity-1", "changelog-card");
    if (empty) card.classList.add("is-empty");
    else {
      card.classList.add("is-link");
      card.addEventListener("click", () => this.openInLauncher(CHANGELOG_URL, t("changelog_title")));
    }
    card.innerHTML = `
            <div class="news-header">
                <div class="header-text"><div class="title">${this.escapeHtml(title)}</div></div>
                ${date ? `<div class="changelog-date">${this.escapeHtml(date)}</div>` : ""}
            </div>
            <div class="news-content"><div class="bbWrapper"><p>${this.escapeHtml(body)}</p></div></div>`;
    return card;
  }

  async fetchChangelog() {
    const res = await nodeFetch(CHANGELOG_URL, { timeout: 6000 });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,nav,header,footer,form").forEach((n) => n.remove());
    const root = doc.querySelector("main") || doc.body;
    const dateRe = /\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b|\b\d{1,2}\s+[a-zéû]+\s+\d{4}\b/i;
    const clean = (txt) => (txt || "").replace(/\s+/g, " ").trim();
    const entries = [];

    const push = (title, body) => {
      title = clean(title);
      body = clean(body);
      if (!title) return;
      const date = (dateRe.exec(`${title} ${body}`) || [""])[0];
      body = clean(body.replace(title, "").replace(date, ""));
      entries.push({
        title: title.replace(date, "").trim() || title,
        body: body.length > 150 ? `${body.slice(0, 149).trimEnd()}…` : body,
        date,
      });
    };

    // 1) blocs de type "carte" (thèmes Bootstrap / Azuriom)
    root.querySelectorAll(".card, article").forEach((card) => {
      const h = card.querySelector("h1,h2,h3,h4,h5,h6,.card-title,.card-header");
      if (!h) return;
      push(h.textContent, card.textContent);
    });

    // 2) à défaut : chaque titre suivi de son texte
    if (!entries.length) {
      root.querySelectorAll("h2,h3,h4").forEach((h) => {
        let body = "";
        for (let n = h.nextElementSibling; n && !/^H[1-6]$/.test(n.tagName); n = n.nextElementSibling) {
          body += ` ${n.textContent}`;
        }
        if (clean(body)) push(h.textContent, body);
      });
    }
    console.log("[Changelog] entrées trouvées :", entries);
    return entries;
  }

  initBtn() {
    document.querySelector(".settings-btn").addEventListener("click", () => {
      changePanel("settings");
    });
  }

  async getDate(e) {
    const date = new Date(e);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const months = [
      t("january"),
      t("february"),
      t("march"),
      t("april"),
      t("may"),
      t("june"),
      t("july"),
      t("august"),
      t("september"),
      t("october"),
      t("november"),
      t("december"),
    ];
    return { year, month: months[month], day };
  }

  async verifyModsBeforeLaunch() {
    const modsDir = path.join(
      dataDirectory,
      process.platform == "darwin"
        ? this.config.dataDirectory
        : `.${this.config.dataDirectory}`,
      "mods",
    );
    const launcherConfigDir = path.join(
      dataDirectory,
      process.platform == "darwin"
        ? this.config.dataDirectory
        : `.${this.config.dataDirectory}`,
      "launcher_config",
    );
    const modsConfigFile = path.join(launcherConfigDir, "mods_config.json");

    if (!fs.existsSync(modsDir) || !fs.existsSync(modsConfigFile)) {
      console.log(
        "Mods directory or config not found, skipping mod verification (first launch).",
      );
      return;
    }

    let modsConfig;
    try {
      modsConfig = JSON.parse(fs.readFileSync(modsConfigFile));
    } catch (error) {
      console.error("Failed to read mods config file:", error);
      return;
    }

    for (const mod in modsConfig) {
      const modFiles = fs
        .readdirSync(modsDir)
        .filter(
          (file) =>
            file.startsWith(mod) &&
            (file.endsWith(".jar") || file.endsWith(".jar-disable")),
        );
      if (modFiles.length > 0) {
        const modFile = modFiles[0];
        const modFilePath = path.join(modsDir, modFile);
        const newModFilePath = modsConfig[mod]
          ? modFilePath.replace(".jar-disable", ".jar")
          : modFilePath.endsWith(".jar-disable")
            ? modFilePath
            : `${modFilePath}.disable`;
        if (modFilePath !== newModFilePath) {
          fs.renameSync(modFilePath, newModFilePath);
        }
      }
    }
  }

  displayEmptyModsMessage(modsListElement) {
    const modElement = document.createElement("div");
    modElement.innerHTML = `
            <div class="mods-container-empty">
              <h2>${t("optional_mods_not_downloaded")}</h2>
            </div>`;
    modsListElement.appendChild(modElement);
  }

  updateRole(account) {
    const tooltipRole = document.querySelector(".player-tooltip-role");
    const sidebarRole = document.querySelector(".player-role");

    if (this.config.role && account.user_info.role) {
      const roleName = account.user_info.role.name;
      tooltipRole.textContent = roleName;
      sidebarRole.textContent = roleName;
    } else {
      tooltipRole.style.display = "none";
      sidebarRole.style.display = "none";
    }
  }

  updateWhitelist(account) {
    const playBtn = document.querySelector(".play-btn");
    if (
      this.config.whitelist_activate &&
      !this.config.whitelist.includes(account.name) &&
      !this.config.whitelist_roles.includes(account.user_info.role.name)
    ) {
      playBtn.style.background = "#696969";
      playBtn.style.pointerEvents = "none";
      playBtn.style.boxShadow = "none";
      playBtn.style.opacity = "0.6";
      playBtn.title = t("unavailable");
    } else {
      playBtn.style.background = "";
      playBtn.style.pointerEvents = "auto";
      playBtn.style.boxShadow = "";
      playBtn.style.opacity = "1";
      playBtn.title = t("play");
    }
  }
}

export default Home;

/*
 * GRID V4.2 missing-equipment email directory
 *
 * Source: email.xlsx supplied for the project.
 * Only cells without yellow highlighting are included. Highlighted addresses
 * are intentionally excluded from every recipient selector.
 *
 * GitHub Pages is a static host, so the default delivery method opens a
 * pre-addressed Outlook Web draft after the missing record is saved. The user
 * reviews the message and presses Send. For unattended sending, configure a
 * secured company webhook/Power Automate endpoint and enforce authentication
 * outside this public JavaScript file.
 */

window.GRID_MISSING_EMAIL_DIRECTORY = Object.freeze({
    AG: Object.freeze([
        "naniza.mtermizi@murata.com",
        "snorazieka.jaafar@murata.com",
        "zamirudin.zulkifli@murata.com"
    ]),
    CAL: Object.freeze([
        "mfaiz.hamidon@murata.com",
        "adimran.hajaman@murata.com",
        "nsarina.roosli@murata.com",
        "mahanum.zulkefily@murata.com"
    ]),
    CM: Object.freeze([
        "mzhafri.bahari@murata.com",
        "mhafizuddin.hfadzilah@murata.com",
        "mfaizad.asamat@murata.com",
        "mridhuan.daud@murata.com",
        "amuzzammil.mnaim@murata.com"
    ]),
    DCC: Object.freeze([
        "natiqah.zainoddin@murata.com",
        "snariff.hassan@murata.com",
        "zuraida.zabidin@murata.com",
        "asnawi.khairi@murata.com",
        "ahakim.hamidi@murata.com"
    ]),
    FP: Object.freeze([
        "mikrom.samsudin@murata.com",
        "mnawawie.khairi@murata.com",
        "mhamizan.hassan@murata.com",
        "snorazieka.jaafar@murata.com"
    ]),
    IQC: Object.freeze([
        "mbaihaqi.danial@murata.com",
        "nazlena.ismail@murata.com"
    ]),
    LQH: Object.freeze([
        "aamin.hassan@murata.com",
        "mfarhan.zuriyani@murata.com",
        "nawanis.aaziz@murata.com",
        "eazim.adenan@murata.com"
    ]),
    OQC: Object.freeze([
        "sfatimah.jali@murata.com",
        "nsabrina.msabri@murata.com",
        "mzyusairi.myusof@murata.com",
        "norazah.mnali@murata.com"
    ]),
    PLT: Object.freeze([
        "kamchun.lee@murata.com",
        "malinda.cwan@murata.com",
        "snordiana.alias@murata.com"
    ]),
    RF: Object.freeze([
        "teddy.chan@murata.com",
        "sivabalan.sarawanan@murata.com",
        "hasmahidayah.hassan@murata.com",
        "smuhammad.amatin@murata.com",
        "mrafiq.rahim@murata.com"
    ]),
    RND: Object.freeze([
        "muaz.azahari@murata.com",
        "sarif.aziz@murata.com"
    ]),
    SPAREPART: Object.freeze([
        "faizaliza.malaudin@murata.com",
        "nanadiya.ahmad@murata.com",
        "msabri.saaid@murata.com"
    ]),
    UTILITY: Object.freeze([
        "mhaffiz.asapari@murata.com",
        "mazri.samsuri@murata.com"
    ]),
    WH: Object.freeze([
        "noraini.maziz@murata.com",
        "helmi.lahmad@murata.com",
        "halimah.ahassan@murata.com"
    ]),
    WORKSHOP: Object.freeze([
        "mnabil.baharuddin@murata.com",
        "mafirdaus.arashid@murata.com"
    ]),
    ENG: Object.freeze([
        "mmukhriz.rambli@murata.com",
        "nazwati.yaacob@murata.com",
        "yazman.arahman@murata.com"
    ]),
    LAB: Object.freeze([
        "fasyafiqah.mfarizal@murata.com",
        "nursahara.musa@murata.com",
        "nhafifi.awalid@murata.com"
    ])
});

window.GRID_MISSING_EMAIL_GROUP_ORDER = Object.freeze([
    "AG", "CAL", "CM", "DCC", "FP", "IQC", "LQH", "OQC", "PLT",
    "RF", "RND", "SPAREPART", "UTILITY", "WH", "WORKSHOP", "ENG", "LAB"
]);

window.GRID_MISSING_EMAIL_CONFIG = {
    composeMode: "outlook-web",
    ccRecipients: Object.freeze([
        "jhasmi.hashim@murata.com",
        "mfaiz.hamidon@murata.com"
    ]),
    outlookComposeUrl: "https://outlook.office.com/mail/deeplink/compose",
    // Keep blank in the GitHub version. A secret or unrestricted webhook URL
    // must never be committed to a public repository.
    webhookUrl: ""
};

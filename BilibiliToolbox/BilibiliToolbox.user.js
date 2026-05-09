// ==UserScript==
// @name         Bilibili Toolbox
// @namespace    https://github.com/yilibala/amazing-little-tool
// @version      1.0.0
// @description  Bilibili comic reader + favorites toolbox in a single Tampermonkey file
// @author       Yilibala
// @match        *://www.bilibili.com/read/*
// @match        *://www.bilibili.com/opus/*
// @match        *://t.bilibili.com/*
// @match        *://www.bilibili.com/*
// @match        *://space.bilibili.com/*
// @run-at       document-start
// ==/UserScript==

// Bilibili Toolbox - CSS Injection
(function () {
    'use strict';

    const styleBase64 = 'LyogQuermeaUtuiXj+WkueW/q+aNt+i3s+i9rCAtIENvbnRlbnQgU3R5bGVzICovDQoNCjpyb290IHsNCiAgICAtLWZhdi1wcmltYXJ5OiAjZmI3Mjk5Ow0KICAgIC0tZmF2LXByaW1hcnktZGFyazogI2ZhNjU5ODsNCiAgICAtLWZhdi1iZzogcmdiYSgwLCAwLCAwLCAwLjg1KTsNCiAgICAtLWZhdi1ib3JkZXI6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yKTsNCiAgICAtLWZhdi1ob3ZlcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpOw0KICAgIC0tZmF2LWRlbGV0ZS1iZzogcmdiYSgwLCAwLCAwLCAwLjQpOw0KICAgIC0tZmF2LXJhZGl1czogOHB4Ow0KICAgIC0tZmF2LXJhZGl1cy1sZzogMTJweDsNCn0NCg0KLyog5oKs5rWu5oyJ6ZKuICovDQojYmlsaWJpbGktZmF2LWZsb2F0LWJ0biB7DQogICAgcG9zaXRpb246IGZpeGVkOw0KICAgIGJvdHRvbTogODBweDsNCiAgICByaWdodDogMjBweDsNCiAgICB3aWR0aDogNTBweDsNCiAgICBoZWlnaHQ6IDUwcHg7DQogICAgYmFja2dyb3VuZDogdmFyKC0tZmF2LXByaW1hcnkpOw0KICAgIGJvcmRlci1yYWRpdXM6IDUwJTsNCiAgICBkaXNwbGF5OiBmbGV4Ow0KICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7DQogICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7DQogICAgZm9udC1zaXplOiAyNHB4Ow0KICAgIGN1cnNvcjogcG9pbnRlcjsNCiAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMjUxLCAxMTQsIDE1MywgMC40KTsNCiAgICB6LWluZGV4OiA5OTk5OTk7DQogICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMnMsIGJveC1zaGFkb3cgMC4ycywgb3BhY2l0eSAwLjNzLCB2aXNpYmlsaXR5IDAuM3M7DQogICAgbGluZS1oZWlnaHQ6IDE7DQogICAgdGV4dC1hbGlnbjogY2VudGVyOw0KfQ0KDQojYmlsaWJpbGktZmF2LWZsb2F0LWJ0bjpob3ZlciB7DQogICAgdHJhbnNmb3JtOiBzY2FsZSgxLjEpOw0KICAgIGJveC1zaGFkb3c6IDAgNnB4IDE2cHggcmdiYSgyNTEsIDExNCwgMTUzLCAwLjYpOw0KfQ0KDQojYmlsaWJpbGktZmF2LWZsb2F0LWJ0bi5oaWRlLWZvcndhcmQtYWN0aXZlIHsNCiAgICBiYWNrZ3JvdW5kOiB2YXIoLS1mYXYtcHJpbWFyeSk7DQogICAgYm9yZGVyLXJhZGl1czogNnB4Ow0KfQ0KDQovKiDmlLbol4/lpLnpnaLmnb8gKi8NCiNiaWxpYmlsaS1mYXYtcGFuZWwgew0KICAgIHBvc2l0aW9uOiBmaXhlZDsNCiAgICBib3R0b206IDE0MHB4Ow0KICAgIHJpZ2h0OiAyMHB4Ow0KICAgIHdpZHRoOiAyODBweDsNCiAgICBtYXgtaGVpZ2h0OiA1MDBweDsNCiAgICBiYWNrZ3JvdW5kOiB2YXIoLS1mYXYtYmcpOw0KICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cigxMHB4KTsNCiAgICBib3JkZXItcmFkaXVzOiB2YXIoLS1mYXYtcmFkaXVzLWxnKTsNCiAgICBib3gtc2hhZG93OiAwIDhweCAzMnB4IHJnYmEoMCwgMCwgMCwgMC4yKTsNCiAgICB6LWluZGV4OiAxMDAwMDAwOw0KICAgIG9wYWNpdHk6IDA7DQogICAgdmlzaWJpbGl0eTogaGlkZGVuOw0KICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4ycywgdHJhbnNmb3JtIDAuMnMsIHZpc2liaWxpdHkgMC4yczsNCiAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAiU2Vnb2UgVUkiLCBSb2JvdG8sICJIZWx2ZXRpY2EgTmV1ZSIsIEFyaWFsLCBzYW5zLXNlcmlmOw0KICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgxMHB4KTsNCiAgICBjb2xvcjogI2ZmZjsNCn0NCg0KI2JpbGliaWxpLWZhdi1wYW5lbC5zaG93IHsNCiAgICBvcGFjaXR5OiAxOw0KICAgIHZpc2liaWxpdHk6IHZpc2libGU7DQogICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOw0KfQ0KDQojYmlsaWJpbGktZmF2LWNvbnRyb2xzLXBhbmVsIHsNCiAgICBwb3NpdGlvbjogZml4ZWQ7DQogICAgYm90dG9tOiAxNDBweDsNCiAgICByaWdodDogMjBweDsNCiAgICB3aWR0aDogMjgwcHg7DQogICAgYmFja2dyb3VuZDogdmFyKC0tZmF2LWJnKTsNCiAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoMTBweCk7DQogICAgYm9yZGVyLXJhZGl1czogdmFyKC0tZmF2LXJhZGl1cy1sZyk7DQogICAgYm94LXNoYWRvdzogMCA4cHggMzJweCByZ2JhKDAsIDAsIDAsIDAuMik7DQogICAgei1pbmRleDogMTAwMDAwMTsNCiAgICBvcGFjaXR5OiAwOw0KICAgIHZpc2liaWxpdHk6IGhpZGRlbjsNCiAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMnMsIHRyYW5zZm9ybSAwLjJzLCB2aXNpYmlsaXR5IDAuMnM7DQogICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgIlNlZ29lIFVJIiwgUm9ib3RvLCAiSGVsdmV0aWNhIE5ldWUiLCBBcmlhbCwgc2Fucy1zZXJpZjsNCiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMTBweCk7DQogICAgY29sb3I6ICNmZmY7DQp9DQoNCiNiaWxpYmlsaS1mYXYtY29udHJvbHMtcGFuZWwuc2hvdyB7DQogICAgb3BhY2l0eTogMTsNCiAgICB2aXNpYmlsaXR5OiB2aXNpYmxlOw0KICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTsNCn0NCg0KLyog6Z2i5p2/5aS06YOoICovDQouYmlsaWJpbGktZmF2LWhlYWRlciB7DQogICAgZGlzcGxheTogZmxleDsNCiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47DQogICAgYWxpZ24taXRlbXM6IGNlbnRlcjsNCiAgICBwYWRkaW5nOiA2cHggMTJweDsNCiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgdmFyKC0tZmF2LWJvcmRlcik7DQogICAgYmFja2dyb3VuZDogdmFyKC0tZmF2LXByaW1hcnkpOw0KICAgIGNvbG9yOiAjZmZmOw0KICAgIGJvcmRlci1yYWRpdXM6IHZhcigtLWZhdi1yYWRpdXMtbGcpIHZhcigtLWZhdi1yYWRpdXMtbGcpIDAgMDsNCiAgICBmb250LXdlaWdodDogNjAwOw0KfQ0KDQouYmlsaWJpbGktZmF2LWNvbnRlbnQgeyBtYXgtaGVpZ2h0OiA0MDBweDsgb3ZlcmZsb3cteTogYXV0bzsgfQ0KLmJpbGliaWxpLWZhdi1saXN0IHsgcGFkZGluZzogMTBweDsgZGlzcGxheTogZmxleDsgZmxleC13cmFwOiB3cmFwOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IH0NCg0KLmJpbGliaWxpLXRvb2xib3gtY29udHJvbC1jb250ZW50IHsgcGFkZGluZzogMTZweDsgZGlzcGxheTogZmxleDsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsgZ2FwOiAxMnB4OyB9DQoNCi5iaWxpYmlsaS10b29sYm94LWNvbnRyb2wtcm93IHsNCiAgICBkaXNwbGF5OiBmbGV4Ow0KICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7DQogICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOw0KICAgIGdhcDogMTJweDsNCiAgICBwYWRkaW5nOiAxMnB4Ow0KICAgIGJvcmRlci1yYWRpdXM6IHZhcigtLWZhdi1yYWRpdXMpOw0KICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWZhdi1ib3JkZXIpOw0KICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7DQogICAgY3Vyc29yOiBwb2ludGVyOw0KfQ0KDQouYmlsaWJpbGktdG9vbGJveC1jb250cm9sLWNvcHkgew0KICAgIGRpc3BsYXk6IGZsZXg7DQogICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsNCiAgICBnYXA6IDRweDsNCiAgICBtaW4td2lkdGg6IDA7DQp9DQoNCi5iaWxpYmlsaS10b29sYm94LWNvbnRyb2wtdGl0bGUgew0KICAgIGZvbnQtc2l6ZTogMTRweDsNCiAgICBmb250LXdlaWdodDogNjAwOw0KICAgIGNvbG9yOiAjZmZmOw0KfQ0KDQouYmlsaWJpbGktdG9vbGJveC1jb250cm9sLWRlc2MsDQouYmlsaWJpbGktdG9vbGJveC1jb250cm9sLXN0YXR1cyB7DQogICAgZm9udC1zaXplOiAxMnB4Ow0KICAgIGxpbmUtaGVpZ2h0OiAxLjU7DQp9DQoNCi5iaWxpYmlsaS10b29sYm94LWNvbnRyb2wtZGVzYyB7IGNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNzgpOyB9DQoNCi5iaWxpYmlsaS10b29sYm94LWNvbnRyb2wtc3RhdHVzIHsNCiAgICBwYWRkaW5nOiAxMHB4IDEycHg7DQogICAgYm9yZGVyLXJhZGl1czogdmFyKC0tZmF2LXJhZGl1cyk7DQogICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTsNCiAgICBjb2xvcjogI2ZmZjsNCn0NCg0KLmJpbGliaWxpLXRvb2xib3gtc3dpdGNoIHsNCiAgICBwb3NpdGlvbjogcmVsYXRpdmU7DQogICAgd2lkdGg6IDQ2cHg7DQogICAgaGVpZ2h0OiAyOHB4Ow0KICAgIGZsZXgtc2hyaW5rOiAwOw0KfQ0KDQouYmlsaWJpbGktdG9vbGJveC1zd2l0Y2ggaW5wdXQgew0KICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTsNCiAgICBpbnNldDogMDsNCiAgICBvcGFjaXR5OiAwOw0KICAgIGN1cnNvcjogcG9pbnRlcjsNCiAgICBtYXJnaW46IDA7DQp9DQoNCi5iaWxpYmlsaS10b29sYm94LXN3aXRjaC1zbGlkZXIgew0KICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTsNCiAgICBpbnNldDogMDsNCiAgICBib3JkZXItcmFkaXVzOiA5OTlweDsNCiAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjQpOw0KICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4ycyBlYXNlOw0KfQ0KDQouYmlsaWJpbGktdG9vbGJveC1zd2l0Y2gtc2xpZGVyOjpiZWZvcmUgew0KICAgIGNvbnRlbnQ6ICIiOw0KICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTsNCiAgICB0b3A6IDNweDsNCiAgICBsZWZ0OiAzcHg7DQogICAgd2lkdGg6IDIycHg7DQogICAgaGVpZ2h0OiAyMnB4Ow0KICAgIGJvcmRlci1yYWRpdXM6IDUwJTsNCiAgICBiYWNrZ3JvdW5kOiAjZmZmOw0KICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjJzIGVhc2U7DQogICAgYm94LXNoYWRvdzogMCAycHggOHB4IHJnYmEoMCwgMCwgMCwgMC4yNSk7DQp9DQoNCi5iaWxpYmlsaS10b29sYm94LXN3aXRjaCBpbnB1dDpjaGVja2VkICsgLmJpbGliaWxpLXRvb2xib3gtc3dpdGNoLXNsaWRlciB7DQogICAgYmFja2dyb3VuZDogdmFyKC0tZmF2LXByaW1hcnkpOw0KfQ0KDQouYmlsaWJpbGktdG9vbGJveC1zd2l0Y2ggaW5wdXQ6Y2hlY2tlZCArIC5iaWxpYmlsaS10b29sYm94LXN3aXRjaC1zbGlkZXI6OmJlZm9yZSB7DQogICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDE4cHgpOw0KfQ0KDQovKiDnqbrnirbmgIEgKi8NCi5iaWxpYmlsaS1mYXYtZW1wdHkgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiAjOTk5OyBwYWRkaW5nOiA0MHB4IDIwcHg7IGZvbnQtc2l6ZTogMTRweDsgfQ0KDQovKiDmtojmga/mj5DnpLogKi8NCi5iaWxpYmlsaS1mYXYtbXNnIHsgcGFkZGluZzogOHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IGZvbnQtc2l6ZTogMTNweDsgZGlzcGxheTogbm9uZTsgfQ0KDQovKiDmlLbol4/pobkgKi8NCi5iaWxpYmlsaS1mYXYtaXRlbS1saW5rIHsgZGlzcGxheTogYmxvY2s7IHRleHQtZGVjb3JhdGlvbjogbm9uZTsgY29sb3I6IGluaGVyaXQ7IHdpZHRoOiBjYWxjKDUwJSAtIDRweCk7IHBvc2l0aW9uOiByZWxhdGl2ZTsgfQ0KDQouYmlsaWJpbGktZmF2LWl0ZW0gew0KICAgIGRpc3BsYXk6IGZsZXg7DQogICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsNCiAgICBhbGlnbi1pdGVtczogY2VudGVyOw0KICAgIHBhZGRpbmc6IDRweCA2cHg7DQogICAgYm9yZGVyLXJhZGl1czogdmFyKC0tZmF2LXJhZGl1cyk7DQogICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjJzOw0KICAgIHRleHQtYWxpZ246IGNlbnRlcjsNCiAgICBwb3NpdGlvbjogcmVsYXRpdmU7DQogICAgb3ZlcmZsb3c6IGhpZGRlbjsNCiAgICBoZWlnaHQ6IDgwcHg7DQogICAgYm94LXNpemluZzogYm9yZGVyLWJveDsNCn0NCg0KLmJpbGliaWxpLWZhdi1pdGVtW2RhdGEtcmVhZGxpc3Q9InRydWUiXSB7IHBhZGRpbmc6IDA7IH0NCi5iaWxpYmlsaS1mYXYtaXRlbS1saW5rOmhvdmVyIC5iaWxpYmlsaS1mYXYtaXRlbSB7IGJhY2tncm91bmQ6IHZhcigtLWZhdi1ob3Zlcik7IH0NCg0KLmJpbGliaWxpLWZhdi1pdGVtLWluZm8gew0KICAgIGRpc3BsYXk6IGZsZXg7DQogICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsNCiAgICBhbGlnbi1pdGVtczogY2VudGVyOw0KICAgIHdpZHRoOiAxMDAlOw0KICAgIGhlaWdodDogMTAwJTsNCiAgICBwb3NpdGlvbjogcmVsYXRpdmU7DQogICAgei1pbmRleDogMTsNCn0NCg0KLmJpbGliaWxpLWZhdi1pdGVtW2RhdGEtcmVhZGxpc3Q9InRydWUiXSAuYmlsaWJpbGktZmF2LWl0ZW0taW5mbyB7IHBhZGRpbmc6IDA7IG92ZXJmbG93OiBoaWRkZW47IGJvcmRlci1yYWRpdXM6IGluaGVyaXQ7IH0NCg0KLyog5aS05YOPICovDQouYmlsaWJpbGktZmF2LWF2YXRhciB7DQogICAgd2lkdGg6IDQ0cHg7DQogICAgaGVpZ2h0OiA0NHB4Ow0KICAgIGJvcmRlci1yYWRpdXM6IDUwJTsNCiAgICBvYmplY3QtZml0OiBjb3ZlcjsNCiAgICBib3JkZXI6IDJweCBzb2xpZCB2YXIoLS1mYXYtcHJpbWFyeSk7DQogICAgcG9zaXRpb246IHJlbGF0aXZlOw0KICAgIHotaW5kZXg6IDE7DQp9DQoNCi5iaWxpYmlsaS1mYXYtYXZhdGFyLmNvdmVyIHsgZGlzcGxheTogYmxvY2s7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJvcmRlci1yYWRpdXM6IHZhcigtLWZhdi1yYWRpdXMpOyBib3JkZXI6IG5vbmU7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgaW5zZXQ6IDA7IH0NCg0KLyog5ZCN56ewICovDQouYmlsaWJpbGktZmF2LW5hbWUgew0KICAgIGZvbnQtc2l6ZTogMTJweDsNCiAgICBjb2xvcjogI2ZmZjsNCiAgICBmb250LXdlaWdodDogNTAwOw0KICAgIG1heC13aWR0aDogMTAwJTsNCiAgICBvdmVyZmxvdzogaGlkZGVuOw0KICAgIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzOw0KICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7DQogICAgcG9zaXRpb246IHJlbGF0aXZlOw0KICAgIHotaW5kZXg6IDE7DQogICAgbWFyZ2luLXRvcDogOHB4Ow0KfQ0KDQouYmlsaWJpbGktZmF2LWl0ZW1bZGF0YS1yZWFkbGlzdD0idHJ1ZSJdIC5iaWxpYmlsaS1mYXYtbmFtZSB7DQogICAgcG9zaXRpb246IGFic29sdXRlOw0KICAgIGJvdHRvbTogMDsNCiAgICBsZWZ0OiAwOw0KICAgIHJpZ2h0OiAwOw0KICAgIGNvbG9yOiAjZmZmOw0KICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCh0cmFuc3BhcmVudCwgcmdiYSgwLDAsMCwwLjcpKTsNCiAgICBwYWRkaW5nOiAyMHB4IDhweCA4cHg7DQogICAgYm9yZGVyLXJhZGl1czogMCAwIHZhcigtLWZhdi1yYWRpdXMpIHZhcigtLWZhdi1yYWRpdXMpOw0KICAgIHRleHQtc2hhZG93OiAwIDFweCAycHggcmdiYSgwLDAsMCwwLjUpOw0KfQ0KDQovKiDliKDpmaTmjInpkq4gKi8NCi5iaWxpYmlsaS1mYXYtZGVsZXRlIHsNCiAgICBwb3NpdGlvbjogYWJzb2x1dGU7DQogICAgdG9wOiA0cHg7DQogICAgcmlnaHQ6IDRweDsNCiAgICB3aWR0aDogMThweDsNCiAgICBoZWlnaHQ6IDE4cHg7DQogICAgcGFkZGluZzogMDsNCiAgICBmb250LXNpemU6IDE0cHg7DQogICAgbGluZS1oZWlnaHQ6IDE2cHg7DQogICAgY29sb3I6ICNmZmY7DQogICAgYmFja2dyb3VuZDogdmFyKC0tZmF2LWRlbGV0ZS1iZyk7DQogICAgYm9yZGVyOiBub25lOw0KICAgIGJvcmRlci1yYWRpdXM6IDUwJTsNCiAgICBjdXJzb3I6IHBvaW50ZXI7DQogICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7DQogICAgei1pbmRleDogMjsNCiAgICBvcGFjaXR5OiAwOw0KfQ0KDQouYmlsaWJpbGktZmF2LWl0ZW06aG92ZXIgLmJpbGliaWxpLWZhdi1kZWxldGUgeyBvcGFjaXR5OiAxOyB9DQouYmlsaWJpbGktZmF2LWRlbGV0ZTpob3ZlciB7IGJhY2tncm91bmQ6ICNmZjQ3NTc7IH0NCg0KLyog5pS26JeP6aG55re75Yqg5oyJ6ZKuICovDQouYmlsaWJpbGktZmF2LWFkZC1idG4gew0KICAgIHBhZGRpbmc6IDhweCAxNnB4Ow0KICAgIGZvbnQtc2l6ZTogMTNweDsNCiAgICBib3JkZXItcmFkaXVzOiA2cHg7DQogICAgY3Vyc29yOiBwb2ludGVyOw0KICAgIHRyYW5zaXRpb246IGFsbCAwLjJzOw0KICAgIGJhY2tncm91bmQ6IHZhcigtLWZhdi1wcmltYXJ5KTsNCiAgICBjb2xvcjogI2ZmZjsNCiAgICBib3JkZXI6IG5vbmU7DQp9DQoNCi5iaWxpYmlsaS1mYXYtYWRkLWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6IHZhcigtLWZhdi1wcmltYXJ5LWRhcmspOyB9DQoNCi8qIOa7muWKqOadoSAqLw0KLmJpbGliaWxpLWZhdi1jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhciB7IHdpZHRoOiA2cHg7IH0NCi5iaWxpYmlsaS1mYXYtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdHJhY2sgeyBiYWNrZ3JvdW5kOiB2YXIoLS1mYXYtaG92ZXIpOyB9DQouYmlsaWJpbGktZmF2LWNvbnRlbnQ6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iIHsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpOyBib3JkZXItcmFkaXVzOiAzcHg7IH0NCi5iaWxpYmlsaS1mYXYtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWI6aG92ZXIgeyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNSk7IH0NCg0KLmJpbGliaWxpLXRvb2xib3gtaGlkZS1mb3J3YXJkLWR5bmFtaWMgeyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IH0NCg==';
    const decodeBase64Utf8 = (base64) => new TextDecoder().decode(Uint8Array.from(atob(base64), ch => ch.charCodeAt(0)));
    const styleText = decodeBase64Utf8(styleBase64);
    const injectStyle = () => {
        if (document.getElementById('bilibili-toolbox-userscript-style')) return;
        const parent = document.head || document.documentElement;
        if (!parent) {
            requestAnimationFrame(injectStyle);
            return;
        }

        const style = document.createElement('style');
        style.id = 'bilibili-toolbox-userscript-style';
        style.textContent = styleText;
        parent.appendChild(style);
    };

    injectStyle();
});

// Bilibili Toolbox - shared.js
// Bilibili Toolbox - shared utilities
(function() {
    'use strict';

    const SHARED_STORAGE_KEY = 'bilibiliToolboxSharedData.v1';
    const STORAGE_VERSION = 1;
    const SHARED_STORAGE_UPDATE_EVENT = 'bilibili-toolbox:shared-storage-updated';
    const USER_TYPE = 'user';
    const READLIST_TYPE = 'readlist';
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';
    const BILIBILI_DOMAIN = 'bilibili.com';
    const BILIBILI_SPACE_URL = 'https://space.bilibili.com/';
    const BILIBILI_READLIST_URL = 'https://www.bilibili.com/read/readlist/rl';
    const UID_URL_PATTERNS = [
        [/space\.bilibili\.com\/(\d+)/, () => true],
        [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
    ];

    function normalizeObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function createDefaultData() {
        return {
            version: STORAGE_VERSION,
            updatedAt: 0,
            favorites: [],
            settings: {}
        };
    }

    function normalizeFavoriteList(favorites) {
        return Array.isArray(favorites)
            ? favorites.filter(item => item && typeof item === 'object')
            : [];
    }

    function normalizeToolboxData(data) {
        const next = normalizeObject(data);
        return {
            version: STORAGE_VERSION,
            updatedAt: typeof next.updatedAt === 'number' ? next.updatedAt : 0,
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeObject(next.settings)
        };
    }

    function stampToolboxData(data, updatedAt = Date.now()) {
        return normalizeToolboxData({
            ...normalizeToolboxData(data),
            version: STORAGE_VERSION,
            updatedAt
        });
    }

    function parseToolboxDataFromRaw(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try {
            return normalizeToolboxData(JSON.parse(raw));
        } catch (_) {
            return null;
        }
    }

    function isBilibiliUrl(url) {
        return typeof url === 'string' && url.includes(BILIBILI_DOMAIN);
    }

    function getFavoriteType(item) {
        return item?.type || USER_TYPE;
    }

    function isReadlistFavorite(item) {
        return getFavoriteType(item) === READLIST_TYPE;
    }

    function getFavoriteKey(item) {
        if (!item) return '';
        const type = isReadlistFavorite(item) ? READLIST_TYPE : USER_TYPE;
        const value = isReadlistFavorite(item) ? item.id : item.uid;
        return value ? `${type}:${value}` : '';
    }

    function getFavoriteName(item) {
        return isReadlistFavorite(item)
            ? (item?.title || '\u4e13\u680f')
            : (item?.uname || '\u7528\u6237');
    }

    function getFavoriteImage(item) {
        return isReadlistFavorite(item)
            ? (item?.cover || FALLBACK_IMAGE)
            : (item?.face || FALLBACK_IMAGE);
    }

    function getFavoriteLink(item) {
        if (!item) return '#';
        return isReadlistFavorite(item)
            ? `${BILIBILI_READLIST_URL}${item.id}`
            : `${BILIBILI_SPACE_URL}${item.uid}/dynamic`;
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function extractUidFromUrl(url) {
        if (typeof url !== 'string') return null;
        for (const [pattern, isValid] of UID_URL_PATTERNS) {
            const match = url.match(pattern);
            if (match && isValid(match[1])) return match[1];
        }
        return null;
    }

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    // Expose API for use by other scripts (extension content scripts, userscripts)
    window.Shared = {
        SHARED_STORAGE_KEY,
        STORAGE_VERSION,
        SHARED_STORAGE_UPDATE_EVENT,
        USER_TYPE,
        READLIST_TYPE,
        FALLBACK_IMAGE,
        BILIBILI_DOMAIN,
        BILIBILI_SPACE_URL,
        BILIBILI_READLIST_URL,
        normalizeObject,
        createDefaultData,
        normalizeFavoriteList,
        normalizeToolboxData,
        stampToolboxData,
        isBilibiliUrl,
        getFavoriteType,
        isReadlistFavorite,
        getFavoriteKey,
        getFavoriteName,
        getFavoriteImage,
        getFavoriteLink,
        escapeHtml,
        extractUidFromUrl,
        $,
        $src
    };
})();

// Bilibili Toolbox - animations.js
// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const BOOK_ANIMATION_DURATION = 500;
    const DEFAULT_ANIMATION_MODE = 'smooth';
    const ANIMATION_MODES = ['none', 'smooth', 'fade'];
    const ANIMATION_BUTTON_MAP = {
        none: ['\u65e0', '\u7ffb\u9875\u52a8\u753b\uff1a\u5173\u95ed', '#333'],
        smooth: ['\u5e73\u6ed1', '\u7ffb\u9875\u52a8\u753b\uff1a\u5e73\u6ed1\u6ed1\u52a8', '#4b5563'],
        fade: ['\u6de1\u5165', '\u7ffb\u9875\u52a8\u753b\uff1a\u6de1\u5165\u6de1\u51fa', '#4b5563'],
        book: ['\u4e66\u672c', '\u7ffb\u9875\u52a8\u753b\uff1a\u4e66\u672c\u5377\u66f2', '#4b5563']
    };

    function normalizeMode(animationMode) {
        return ANIMATION_MODES.includes(animationMode) ? animationMode : DEFAULT_ANIMATION_MODE;
    }

    function getNextMode(animationMode) {
        const currentIndex = ANIMATION_MODES.indexOf(normalizeMode(animationMode));
        return ANIMATION_MODES[(currentIndex + 1) % ANIMATION_MODES.length];
    }

    function syncAnimationButtonState(animationBtn, animationMode) {
        if (!animationBtn) return;
        const [text, title, background] = ANIMATION_BUTTON_MAP[normalizeMode(animationMode)];
        Object.assign(animationBtn, { innerText: text, title });
        animationBtn.style.background = background;
    }

    function resolveRenderMode(animate, hasExistingImage, animationMode) {
        return animate && hasExistingImage ? normalizeMode(animationMode) : 'none';
    }

    function resolveTransitionDirection(step, isRightToLeft, lastStep) {
        const normalizedStep = step || (isRightToLeft ? lastStep : -lastStep) || 1;
        return isRightToLeft ? (normalizedStep > 0 ? 1 : -1) : (normalizedStep > 0 ? -1 : 1);
    }

    function playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `transform ${FADE_ANIMATION_DURATION}ms, opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none',
            transform: `translateX(${direction * FADE_SHIFT_DISTANCE}px) scale(0.95)`
        });
        window.setTimeout(() => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'smooth', direction);
        }, FADE_ANIMATION_DURATION);
    }

    function playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none'
        });
        window.setTimeout(() => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'fade', direction);
        }, FADE_ANIMATION_DURATION);
    }

    // =====================================================================
    // 书本翻页动画（占位，待实现）
    // =====================================================================
    function playBookTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        // TODO: 实现书本3D翻页动画
        // 提示：可参考 StPageFlip-master 的几何交点算法
        console.warn('[BilibiliToolbox] book transition not implemented yet, falling back to fade');
        playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
    }

    // =====================================================================
    // 动画流程编排
    // =====================================================================

    function runTransitionFlow(options) {
        const {
            animate, imgContainer, animationMode, step, isRightToLeft, lastStep,
            renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages
        } = options;
        const renderMode = resolveRenderMode(animate, Boolean(imgContainer.firstChild), animationMode);
        const direction = resolveTransitionDirection(step, isRightToLeft, lastStep);

        if (renderMode === 'smooth') {
            playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        if (renderMode === 'fade') {
            playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        if (renderMode === 'book') {
            playBookTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        loadImages(renderIndex, 'none', direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform) {
        const mode = normalizeMode(animationMode);
        imgContainer.innerHTML = '';
        imgContainer.style.transition = 'none';
        applyTransform();
        if (mode === 'smooth') {
            Object.assign(imgContainer.style, {
                transform: `translateX(${-transitionDirection * FADE_SHIFT_DISTANCE}px) scale(0.95)`,
                opacity: '0', filter: 'none'
            });
        } else if (mode === 'fade') {
            Object.assign(imgContainer.style, { opacity: '0', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { opacity: '1', filter: 'none' });
        }
    }

    function finishAnimatedRender(imgContainer, animationMode, transitionDirection, applyTransform) {
        const mode = normalizeMode(animationMode);
        if (mode === 'smooth') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `transform ${FADE_SETTLE_DURATION}ms ease-out, opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1', filter: 'none', transform: 'translateX(0) scale(1)'
            });
        } else if (mode === 'fade') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1', filter: 'none'
            });
        } else if (mode === 'book') {
            // TODO: 实现书本动画结束时的处理
            Object.assign(imgContainer.style, { transition: 'none', opacity: '1', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { transition: 'none', opacity: '1', filter: 'none' });
        }
        applyTransform();
    }

    window.BiliAnimations = {
        FADE_ANIMATION_DURATION,
        FADE_SETTLE_DURATION,
        FADE_SHIFT_DISTANCE,
        BOOK_ANIMATION_DURATION,
        DEFAULT_ANIMATION_MODE,
        ANIMATION_MODES,
        normalizeAnimationMode: normalizeMode,
        getNextAnimationMode: getNextMode,
        syncAnimationButton: syncAnimationButtonState,
        runTransition: runTransitionFlow,
        resetImageContainer: resetAnimatedContainer,
        finishRender: finishAnimatedRender
    };
})();

// Bilibili Toolbox - content.js
// Bilibili Toolbox - Content Script
// 整合了极光漫画+ 收藏夹功能（本地版 - 无外部API调用）
(function() {
    'use strict';

    // ============ 常量定义 ============
    const VIEW_MODES = ['auto', 'single', 'double'];

    // 漫画模式常量
    const COMIC_URL_PATTERNS = [
        'bilibili.com/read/',
        'bilibili.com/opus/',
        't.bilibili.com/'
    ];
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.1;
    const CONTROLS_HIDE_DELAY = 1000;
    const SWIPE_THRESHOLD = 50;
    const PRELOAD_COUNT = 4;
    const MOBILE_BREAKPOINT = 768;
    const TOUCH_TAP_ZONE_RATIO = 0.3;
    const READER_BACKGROUND = '#0a0a0a';
    const animations = window.BiliAnimations;

    // 扩展独有设置键
    const TOOLBOX_SETTINGS = {
        hideForwardDynamics: 'hideForwardDynamics'
    };
    const SPACE_DYNAMIC_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/\d+\/dynamic(?:[/?#]|$)/i;
    const DYNAMIC_CARD_SELECTOR = '.bili-dyn-list__item, .bili-dyn-item, .bili-opus-view';
    const FORWARD_DYNAMIC_SELECTOR = [
        '.bili-dyn-content__forw__desc',
        '.bili-dyn-content__orig.reference',
        '.bili-dyn-content__orig__author',
        '.dyn-orig-author',
        '[class*="opus-module-top__forward"]',
        '[class*="module-top-forward"]'
    ].join(', ');
    const FORWARD_ACTION_SELECTORS = [
        '.module-author__action',
        '.bili-dyn-item__action',
        '.bili-dyn-title__action',
        '.bili-dyn-author__action',
        '.opus-module-author__action'
    ];
    const HIDDEN_FORWARD_CLASS = 'bilibili-toolbox-hide-forward-dynamic';
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';
    const FORWARD_TYPE_PATTERN = /(^|[\s:_-])(forward|repost)([\s:_-]|$)/i;
    const FORWARD_TEXT_MARKERS = ['转发了动态', '转发了视频', '转发了专栏', '转发了'];

    // 存储收藏列表（支持用户和专栏）
    let toolboxData = window.Shared.createDefaultData();

    function extractUserNameFromMeta() {
        const title = document.title || '';
        const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const profileSuffixPattern = '(?:\\u7684)?\\u4e2a\\u4eba(?:\\u52a8\\u6001|\\u7a7a\\u95f4|\\u4e3b\\u9875)';

        return (
            title.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || keywords.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || description.match(/\u54d4\u54e9\u54d4\u54e9(.+?)\u7684\u4e2a\u4eba(?:\u52a8\u6001|\u7a7a\u95f4)/)?.[1]
            || description.match(/\u5173\u6ce8(.+?)\u8d26\u53f7/)?.[1]
            || ''
        ).trim();
    }

    function sortFavorites(favorites) {
        return [...favorites].sort((a, b) => window.Shared.isReadlistFavorite(a) - window.Shared.isReadlistFavorite(b));
    }

    function mergeToolboxDataSources(sources) {
        const normalizedSources = (Array.isArray(sources) ? sources : [])
            .filter(Boolean)
            .map(source => window.Shared.normalizeToolboxData(source));
        const mergedFavorites = [];
        const favoriteKeys = new Set();

        normalizedSources.forEach(source => {
            source.favorites.forEach(item => {
                const key = window.Shared.getFavoriteKey(item);
                if (!key || favoriteKeys.has(key)) return;
                favoriteKeys.add(key);
                mergedFavorites.push(item);
            });
        });

        const mergedSettings = {};
        for (let index = normalizedSources.length - 1; index >= 0; index -= 1) {
            Object.assign(mergedSettings, normalizedSources[index].settings);
        }

        const updatedAt = normalizedSources.reduce(
            (maxUpdatedAt, source) => Math.max(maxUpdatedAt, source.updatedAt || 0),
            0
        );

        return window.Shared.stampToolboxData({
            favorites: mergedFavorites,
            settings: mergedSettings
        }, updatedAt || Date.now());
    }

    function isSameToolboxData(a, b) {
        const left = window.Shared.normalizeToolboxData(a);
        const right = window.Shared.normalizeToolboxData(b);
        return JSON.stringify({
            favorites: left.favorites,
            settings: left.settings
        }) === JSON.stringify({
            favorites: right.favorites,
            settings: right.settings
        });
    }

    function parseSharedToolboxData(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try {
            return window.Shared.normalizeToolboxData(JSON.parse(raw));
        } catch (_) {
            return null;
        }
    }

    function readSharedToolboxData() {
        try {
            return parseSharedToolboxData(window.localStorage.getItem(window.Shared.SHARED_STORAGE_KEY));
        } catch (_) {
            return null;
        }
    }

    function mirrorSharedToolboxData(data, shouldDispatchEvent = true, source = 'extension') {
        const nextData = window.Shared.normalizeToolboxData(data);
        try {
            window.localStorage.setItem(window.Shared.SHARED_STORAGE_KEY, JSON.stringify(nextData));
        } catch (_) {}

        if (shouldDispatchEvent) {
            window.dispatchEvent(new CustomEvent(window.Shared.SHARED_STORAGE_UPDATE_EVENT, {
                detail: { updatedAt: nextData.updatedAt, source }
            }));
        }

        return nextData;
    }

    function readExtensionSharedToolboxData(callback) {
        chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY], (result) => {
            const data = result[window.Shared.SHARED_STORAGE_KEY]
                ? window.Shared.normalizeToolboxData(result[window.Shared.SHARED_STORAGE_KEY])
                : null;
            callback?.(data);
        });
    }

    function writeSharedToolboxData(data, shouldDispatchEvent = true, callback) {
        const nextData = window.Shared.stampToolboxData(data, Date.now());
        chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: nextData }, () => {
            toolboxData = nextData;
            mirrorSharedToolboxData(nextData, shouldDispatchEvent);
            callback?.(nextData);
        });
    }

    function cleanupObsoleteStorage(callback) {
        const obsoleteExtensionKeys = ['bilibiliToolboxData', 'bilibiliFavorites', 'bilibiliToolboxMirrorData'];
        const obsoleteUserscriptKeys = obsoleteExtensionKeys.map(key => `tm.bilibili-toolbox.${key}`);

        obsoleteUserscriptKeys.forEach((key) => {
            try {
                window.localStorage.removeItem(key);
            } catch (_) {}
        });

        chrome.storage.local.remove(obsoleteExtensionKeys, () => {
            callback?.();
        });
    }

    // ============ 数据迁移函数 - 从旧版本迁移数据 ============
    function initializeToolboxData(callback) {
        loadToolboxData(() => {
            cleanupObsoleteStorage(() => {
                callback?.(toolboxData);
            });
        });
    }

    // 保存数据
    function saveData(dataOrCallback, maybeCallback) {
        const hasExplicitData = typeof dataOrCallback !== 'function';
        const callback = hasExplicitData ? maybeCallback : dataOrCallback;
        const nextData = hasExplicitData ? dataOrCallback : toolboxData;
        writeSharedToolboxData(nextData, true, () => {
            callback?.(toolboxData);
        });
    }

    function loadToolboxData(callback) {
        readExtensionSharedToolboxData((extensionData) => {
            const pageData = readSharedToolboxData();
            const sources = [extensionData, pageData].filter(Boolean);
            const mergedData = mergeToolboxDataSources(
                sources.length > 0 ? sources : [window.Shared.createDefaultData()]
            );

            if (!extensionData || !isSameToolboxData(mergedData, extensionData)) {
                writeSharedToolboxData(mergedData, false, () => {
                    mirrorSharedToolboxData(toolboxData, false);
                    callback?.(toolboxData);
                });
                return;
            }

            toolboxData = extensionData;
            if (!pageData || !isSameToolboxData(pageData, extensionData) || pageData.updatedAt !== extensionData.updatedAt) {
                mirrorSharedToolboxData(extensionData, false);
            }
            callback?.(toolboxData);
        });
    }

    function setFavorites(favorites) {
        saveData({
            ...toolboxData,
            favorites
        }, () => {
            renderFavoriteList();
        });
    }

    function getSettingValue(key, fallback = false) {
        return Object.prototype.hasOwnProperty.call(toolboxData.settings, key)
            ? toolboxData.settings[key]
            : fallback;
    }

    function setSettingValue(key, value, callback) {
        saveData({
            ...toolboxData,
            settings: {
                ...toolboxData.settings,
                [key]: value
            }
        }, callback);
    }

    // ============ 收藏夹功能 ============
    function handleSharedToolboxUpdate() {
        loadToolboxData(() => {
            renderFavoriteList();
            renderDynamicControlsPanel();
            scheduleApplyDynamicFilters();
            scheduleDynamicFilterRetries();
        });
    }

    function handleSharedStorageEvent(event) {
        if (event?.type === 'storage' && event.key !== window.Shared.SHARED_STORAGE_KEY) return;
        if (event?.type === window.Shared.SHARED_STORAGE_UPDATE_EVENT && String(event.detail?.source || '').startsWith('extension')) return;
        handleSharedToolboxUpdate();
    }

    function handleExtensionStorageChange(changes, areaName) {
        if (areaName !== 'local' || !changes[window.Shared.SHARED_STORAGE_KEY]?.newValue) return;
        toolboxData = window.Shared.normalizeToolboxData(changes[window.Shared.SHARED_STORAGE_KEY].newValue);
        mirrorSharedToolboxData(toolboxData, true, 'extension-sync');
        renderFavoriteList();
        renderDynamicControlsPanel();
        scheduleApplyDynamicFilters();
        scheduleDynamicFilterRetries();
    }

    function setupSharedStorageListeners() {
        window.addEventListener('storage', handleSharedStorageEvent);
        window.addEventListener(window.Shared.SHARED_STORAGE_UPDATE_EVENT, handleSharedStorageEvent);
        chrome.storage.onChanged.addListener(handleExtensionStorageChange);
    }

    let isHovering = false;
    let dynamicFilterObserver = null;
    let dynamicFilterTimer = 0;
    let dynamicFilterRetryTimer = 0;

    // 创建悬浮按钮
    function syncFloatBtnHideState() {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn) return;
        const hideForward = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));
        btn.classList.toggle('hide-forward-active', hideForward);
    }

    function createFloatingButton() {
        if (document.getElementById('bilibili-fav-float-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'bilibili-fav-float-btn';
        btn.innerHTML = '&#11088;';
        btn.title = '悬停查看收藏，右键打开动态过滤';
        document.body.appendChild(btn);

        btn.addEventListener('mouseenter', () => { isHovering = true; showFavoritesPanel(); });
        btn.addEventListener('mouseleave', () => { isHovering = false; setTimeout(() => { if (!isHovering) hideFavoritesPanel(); }, 200); });
        btn.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            isHovering = false;
            hideFavoritesPanel();
            toggleDynamicControlsPanel();
        });

        syncFloatBtnHideState();
    }

    // 创建收藏夹面板
    function createFavoritesPanel() {
        if (document.getElementById('bilibili-fav-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>我的收藏</span><button class="bilibili-fav-add-btn">+ 添加当前</button></div>
            <div class="bilibili-fav-content"><div class="bilibili-fav-list"></div></div>
            <div class="bilibili-fav-msg"></div>
        `;

        document.body.appendChild(panel);

        panel.addEventListener('mouseenter', () => { isHovering = true; });
        panel.addEventListener('mouseleave', () => { isHovering = false; hideFavoritesPanel(); });
        panel.addEventListener('click', (e) => {
            const del = e.target.closest('.bilibili-fav-delete');
            if (del) { e.preventDefault(); e.stopPropagation(); deleteFavorite(del.dataset.key); }
        });

        panel.querySelector('.bilibili-fav-add-btn').onclick = addCurrent;

        renderFavoriteList();
    }

    function showFavoritesPanel() {
        let panel = document.getElementById('bilibili-fav-panel');
        if (!panel) { createFavoritesPanel(); panel = document.getElementById('bilibili-fav-panel'); }
        hideDynamicControlsPanel();
        panel?.classList.add('show');
        loadFavorites();
    }

    function hideFavoritesPanel() {
        const panel = document.getElementById('bilibili-fav-panel');
        if (panel) panel.classList.remove('show');
    }

    function showMessage(text, isError = false) {
        const msgEl = document.querySelector('.bilibili-fav-msg');
        if (!msgEl) return;
        Object.assign(msgEl.style, { color: isError ? '#ff4757' : '#4cd964', display: 'block' });
        msgEl.textContent = text;
        setTimeout(() => { msgEl.style.display = 'none'; }, CONTROLS_HIDE_DELAY);
    }

    function loadFavorites() {
        loadToolboxData(() => {
            renderFavoriteList();
        });
    }

    function createDynamicControlsPanel() {
        if (document.getElementById('bilibili-fav-controls-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-controls-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>动态控制</span></div>
            <div class="bilibili-toolbox-control-content">
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">隐藏转发动态</span>
                        <span class="bilibili-toolbox-control-desc">隐藏转发</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-forward-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <div class="bilibili-toolbox-control-status"></div>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.bilibili-toolbox-forward-toggle').addEventListener('change', (event) => {
            const enabled = Boolean(event.target.checked);
            setSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, enabled, () => {
                syncFloatBtnHideState();
                renderDynamicControlsPanel();
                scheduleApplyDynamicFilters();
                scheduleDynamicFilterRetries();
            });
        });

        renderDynamicControlsPanel();
    }

    function isDynamicControlsPanelVisible() {
        return document.getElementById('bilibili-fav-controls-panel')?.classList.contains('show');
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return SPACE_DYNAMIC_URL_PATTERN.test(url);
    }

    function renderDynamicControlsPanel() {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        if (!panel) return;

        const toggle = panel.querySelector('.bilibili-toolbox-forward-toggle');
        const status = panel.querySelector('.bilibili-toolbox-control-status');
        const enabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));

        if (toggle) toggle.checked = enabled;
        if (!status) return;

        if (!isSpaceDynamicPage()) {
            status.textContent = enabled
                ? '在用户动态页生效'
                : '在用户动态页生效';
            return;
        }

        status.textContent = enabled
            ? '已隐藏转发动态'
            : '已显示全部动态';
        syncFloatBtnHideState();
    }

    function showDynamicControlsPanel() {
        let panel = document.getElementById('bilibili-fav-controls-panel');
        if (!panel) {
            createDynamicControlsPanel();
            panel = document.getElementById('bilibili-fav-controls-panel');
        }

        hideFavoritesPanel();
        loadToolboxData(() => {
            renderDynamicControlsPanel();
            panel?.classList.add('show');
        });
    }

    function hideDynamicControlsPanel() {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        if (panel) panel.classList.remove('show');
    }

    function toggleDynamicControlsPanel() {
        if (isDynamicControlsPanelVisible()) {
            hideDynamicControlsPanel();
            return;
        }

        showDynamicControlsPanel();
    }

    function getDynamicCardElements() {
        const candidates = Array.from(document.querySelectorAll(DYNAMIC_CARD_SELECTOR))
            .filter(element => element instanceof HTMLElement);

        return candidates.filter((card, index) => !candidates.some((other, otherIndex) => {
            if (index === otherIndex) return false;
            return other.contains(card);
        }));
    }

    function hasForwardActionText(card) {
        return FORWARD_ACTION_SELECTORS.some((selector) => {
            const text = card.querySelector(selector)?.textContent?.replace(/\s+/g, '') || '';
            return FORWARD_TEXT_MARKERS.some(marker => text.includes(marker));
        });
    }

    function getForwardDynamicSignals(card) {
        if (!(card instanceof HTMLElement)) {
            return {
                hasForwardType: false,
                hasForwardAction: false,
                hasForwardModule: false
            };
        }

        const attrText = [
            card.dataset.type,
            card.dataset.dynType,
            card.getAttribute('data-type'),
            card.getAttribute('data-dyn-type')
        ].filter(Boolean).join(' ');

        return {
            hasForwardType: FORWARD_TYPE_PATTERN.test(attrText),
            hasForwardAction: hasForwardActionText(card),
            hasForwardModule: Boolean(card.querySelector(FORWARD_DYNAMIC_SELECTOR))
        };
    }

    function applyDynamicFilters() {
        renderDynamicControlsPanel();

        const shouldHideForwardDynamics = isSpaceDynamicPage()
            && Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));

        if (!shouldHideForwardDynamics) {
            document.querySelectorAll(`.${HIDDEN_FORWARD_CLASS}`).forEach((card) => {
                card.classList.remove(HIDDEN_FORWARD_CLASS);
            });
            return;
        }

        const evaluations = getDynamicCardElements().map((card) => ({
            card,
            ...getForwardDynamicSignals(card)
        }));

        const shouldIgnoreModuleOnlyMatches = evaluations.length > 0
            && evaluations.every(({ hasForwardType, hasForwardAction, hasForwardModule }) => hasForwardModule && !hasForwardType && !hasForwardAction);

        evaluations.forEach(({ card, hasForwardType, hasForwardAction, hasForwardModule }) => {
            const shouldHide = hasForwardType || hasForwardAction || (!shouldIgnoreModuleOnlyMatches && hasForwardModule);
            card.classList.toggle(HIDDEN_FORWARD_CLASS, shouldHide);
        });
    }

    function scheduleApplyDynamicFilters() {
        if (dynamicFilterTimer) clearTimeout(dynamicFilterTimer);
        dynamicFilterTimer = window.setTimeout(() => {
            dynamicFilterTimer = 0;
            applyDynamicFilters();
        }, 80);
    }

    function clearDynamicFilterRetries() {
        if (!dynamicFilterRetryTimer) return;
        clearTimeout(dynamicFilterRetryTimer);
        dynamicFilterRetryTimer = 0;
    }

    function scheduleDynamicFilterRetries() {
        clearDynamicFilterRetries();

        if (!isSpaceDynamicPage() || !getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false)) {
            return;
        }

        let retriesLeft = 12;
        const retry = () => {
            scheduleApplyDynamicFilters();
            retriesLeft -= 1;
            if (retriesLeft <= 0) {
                dynamicFilterRetryTimer = 0;
                return;
            }

            dynamicFilterRetryTimer = window.setTimeout(retry, 350);
        };

        retry();
    }

    function notifyUrlChange() {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function installUrlChangeListener() {
        if (window.__bilibiliToolboxUrlChangePatched) return;
        window.__bilibiliToolboxUrlChangePatched = true;

        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') return;

            history[methodName] = function(...args) {
                const result = original.apply(this, args);
                notifyUrlChange();
                return result;
            };
        });

        window.addEventListener('popstate', notifyUrlChange);
        window.addEventListener('hashchange', notifyUrlChange);
    }

    function initDynamicFilterObserver() {
        if (dynamicFilterObserver || !document.body) return;

        dynamicFilterObserver = new MutationObserver((mutations) => {
            const hasChildMutation = mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length);
            if (!hasChildMutation) return;
            if (!getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false) && !isSpaceDynamicPage() && !isDynamicControlsPanelVisible()) return;
            scheduleApplyDynamicFilters();
        });

        dynamicFilterObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function handleDocumentPointerDown(event) {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        const button = document.getElementById('bilibili-fav-float-btn');
        if (!panel?.classList.contains('show')) return;
        if (panel.contains(event.target) || button?.contains(event.target)) return;
        hideDynamicControlsPanel();
    }

    function handleDocumentKeyDown(event) {
        if (event.key === 'Escape') hideDynamicControlsPanel();
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = window.Shared.isReadlistFavorite(item);
        return {
            isReadlist,
            key: window.Shared.escapeHtml(window.Shared.getFavoriteKey(item)),
            link: window.Shared.escapeHtml(window.Shared.getFavoriteLink(item)),
            img: window.Shared.escapeHtml(window.Shared.getFavoriteImage(item)) || window.Shared.FALLBACK_IMAGE,
            imgClass: isReadlist ? 'bilibili-fav-avatar cover' : 'bilibili-fav-avatar',
            name: window.Shared.escapeHtml(window.Shared.getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;
        const favorites = toolboxData.favorites || [];
        if (favorites.length === 0) return listEl.innerHTML = '<div class="bilibili-fav-empty">暂无收藏<br>点击下方按钮添加</div>';

        listEl.innerHTML = sortFavorites(favorites).map(item => {
            const { isReadlist, key, link, img, imgClass, name } = getFavoriteDisplayData(item);
            return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="bilibili-fav-item-link">
                <div class="bilibili-fav-item"${isReadlist ? ' data-readlist="true"' : ''}>
                    <div class="bilibili-fav-item-info"><img src="${img}" alt="${name}" class="${imgClass}"><span class="bilibili-fav-name">${name}</span></div>
                    <button class="bilibili-fav-delete" data-key="${key}">&times;</button>
                </div>
            </a>`;
        }).join('');
    }

    // 添加当前页面内容（用户或专栏）- 纯本地版本
    function addCurrent() {
        const pageInfo = getCurrentPageInfo();
        if (!pageInfo) return showMessage('无法获取当前页面信息', true);

        const favorites = toolboxData.favorites;
        const favoriteKey = window.Shared.getFavoriteKey(pageInfo);
        if (favorites.some(item => window.Shared.getFavoriteKey(item) === favoriteKey)) {
            return showMessage('已在收藏列表', true);
        }

        // 从页面DOM提取信息（不上传，不调用API）
        const item = extractPageInfoForFavorite(pageInfo);
        setFavorites([...favorites, item]);
        showMessage('添加成功');
    }

    // 从页面提取收藏所需信息（纯本地，不请求API）
    function extractPageInfoForFavorite(pageInfo) {
        if (window.Shared.isReadlistFavorite(pageInfo)) {
            // 专栏：从页面提取标题和封面
            return {
                type: window.Shared.READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '专栏',
                cover: pageInfo.cover || window.Shared.FALLBACK_IMAGE
            };
        } else {
            // 用户：提取用户名和头像
            const uname = document.querySelector('.user-name, .user-name-shadow, .name')?.textContent?.trim()
                || document.querySelector('[data-mid]')?.getAttribute('data-uname')
                || extractUserNameFromMeta()
                || '用户';
            const face = document.querySelector('.user-face img, .avatar img, [class*="face"] img')?.src
                || document.querySelector('[data-mid]')?.getAttribute('data-face')
                || '';

            return {
                type: window.Shared.USER_TYPE,
                uid: pageInfo.uid,
                uname: uname,
                face: face
            };
        }
    }

    // 获取当前页面信息
    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = window.Shared.$('.read-list-title, .title, h1', '专栏');
            const cover = window.Shared.$src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: window.Shared.READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const uid = window.Shared.extractUidFromUrl(url);
        if (uid) return { type: window.Shared.USER_TYPE, uid };

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector('.user-name, .user-name-shadow, .name')?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: window.Shared.USER_TYPE, uid: pageUid } : null;
    }

    function deleteFavorite(favoriteKey) {
        const favorites = toolboxData.favorites;
        const filtered = favorites.filter(item => window.Shared.getFavoriteKey(item) !== favoriteKey);
        if (filtered.length !== favorites.length) setFavorites(filtered);
    }

    function initFavorites() {
        setupSharedStorageListeners();
        createFloatingButton();
        createDynamicControlsPanel();
        installUrlChangeListener();
        initDynamicFilterObserver();
        document.addEventListener('mousedown', handleDocumentPointerDown, true);
        document.addEventListener('keydown', handleDocumentKeyDown);
        window.addEventListener(URL_CHANGE_EVENT, () => {
            renderDynamicControlsPanel();
            scheduleApplyDynamicFilters();
            scheduleDynamicFilterRetries();
        });
        scheduleApplyDynamicFilters();
        scheduleDynamicFilterRetries();
    }


    // ============ 漫画模式功能 ============

    class BiliComicReader {
        constructor() {
            // 状态管理
            this.imgList = [];
            this.currentIndex = 0;
            this.lastStep = 2;
            this.isRightToLeft = true;
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
            this.viewMode = 'auto'; // 视图模式: auto(自动), single(单图), double(双图)
            this.rotation = 0; // 旋转角度 (0, 90, 180, 270)
            this.activePageCount = 1;
            this.controlsVisible = true;
            this.isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
            this.isCompactLayout = false;
            this.isSelectingScreenshot = false;
            this.isDraggingSelection = false;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.selectionWasControlsVisible = true;
            this.selectionPointerId = null;
            this.pageFlipToken = 0;
            this.transformTransitionTimer = null;

            // 拖拽状态
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.initX = 0;
            this.initY = 0;

            // 触摸滑动状态
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.touchEndX = 0;
            this.touchEndY = 0;
            this.isTouchSwiping = false;
            this.touchStartTime = 0;
            this.touchStartedOnInteractive = false;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.pendingTapTimer = null;
            this.lastTapTime = 0;
            this.lastTapX = 0;
            this.lastTapY = 0;

            // 双指缩放状态
            this.isTwoFingerGesturing = false;
            this.initialPinchDistance = 0;
            this.initialScale = 1;
            this.initialCenterX = 0;
            this.initialCenterY = 0;
            this.twoFingerTapCandidate = false;
            this.twoFingerTapStartTime = 0;
            this.twoFingerTapCenterX = 0;
            this.twoFingerTapCenterY = 0;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;

            // DOM 元素引用
            this.el = {};

            // 绑定全局事件的 this 指向，便于后续解绑
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseUp = this.handleMouseUp.bind(this);
            this.boundHandleTouchStart = this.handleTouchStart.bind(this);
            this.boundHandleTouchMove = this.handleTouchMove.bind(this);
            this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
            this.handleSelectionPointerDown = this.handleSelectionPointerDown.bind(this);
            this.handleSelectionPointerMove = this.handleSelectionPointerMove.bind(this);
            this.handleSelectionPointerUp = this.handleSelectionPointerUp.bind(this);
            this.handleResize = this.handleResize.bind(this);
        }

        // 1. 初始化入口按钮
        init() {
            const entryBtn = document.createElement('button');
            entryBtn.innerHTML = '&#128216;';
            entryBtn.style.cssText = this.isTouchDevice
                ? 'position:fixed;bottom:16px;right:16px;z-index:9999;padding:12px 16px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:20px;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.2)'
                : 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 18px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:22px;font-size:20px;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

        normalizeImageUrl(rawSrc) {
            if (!rawSrc || typeof rawSrc !== 'string' || rawSrc.includes('base64')) return '';
            let src = rawSrc.split('@')[0];
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('http:')) src = 'https:' + src.slice(5);
            return src.startsWith('http') ? src : '';
        }

        collectDynamicImagesFromState() {
            const modules = window.__INITIAL_STATE__?.detail?.modules;
            if (!Array.isArray(modules)) return [];

            return modules.flatMap(module => {
                const pics = module?.module_top?.display?.album?.pics;
                if (!Array.isArray(pics)) return [];
                return pics
                    .map(pic => this.normalizeImageUrl(pic?.url || ''))
                    .filter(Boolean);
            });
        }

        collectDynamicImagesFromDom() {
            const fileSet = new Set();
            const images = [];
            const rawImages = document.querySelectorAll(`
                .opus-module-content img,
                .article-content img,
                .bili-rich-text img,
                .opus-read-content img,
                .horizontal-scroll-album__indicator__thumbnail img,
                .horizontal-scroll-album__pic__img img
            `);

            rawImages.forEach(img => {
                const src = this.normalizeImageUrl(img.getAttribute('src') || img.getAttribute('data-src') || '');
                if (!src) return;

                const isNoise = img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover');
                const isEmoji = img.classList.contains('emoji') || src.includes('emote') || src.includes('emoji') || src.includes('garb');
                const fileName = src.split('/').pop();

                if (!fileSet.has(fileName) && !isNoise && !isEmoji) {
                    fileSet.add(fileName);
                    images.push(src);
                }
            });

            return images;
        }

        // 2. 启动阅读器
        start() {
            const mergedImages = [
                ...this.collectDynamicImagesFromState(),
                ...this.collectDynamicImagesFromDom()
            ];
            const seen = new Set();
            this.imgList = mergedImages.filter(src => {
                const fileName = src.split('/').pop();
                if (!fileName || seen.has(fileName)) return false;
                seen.add(fileName);
                return true;
            });

            // 排序纠正保持不变
            this.imgList.sort((a, b) => {
                const getTop = (url) => {
                    const fn = url.split('/').pop();
                    const el = document.querySelector(`img[src*="${fn}"], img[data-src*="${fn}"]`);
                    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
                };
                return getTop(a) - getTop(b);
            });

            if (this.imgList.length === 0) return alert('未找到漫画图片');

            this.currentIndex = 0;
            this.lastStep = 2;
            this.isDragging = false;
            this.animationMode = animations.normalizeAnimationMode(this.animationMode);

            // 隐藏收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = 'none';

            this.createUI();
            this.bindEvents();
            this.render();
        }

        // 3. 创建 UI
        createUI() {
            const btnStyle = 'padding:8px 15px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:4px';
            const altBtnStyle = `${btnStyle};background:#444`;
            const createBtn = (text, title, style = btnStyle) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.title = title;
                btn.style.cssText = style;
                return btn;
            };

            this.el.reader = document.createElement('div');
            this.el.reader.id = 'comic-reader-overlay';
            this.el.reader.style.cssText = `position:fixed;inset:0;background:${READER_BACKGROUND};z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;touch-action:none;overscroll-behavior:none;perspective:2400px;isolation:isolate`;

            this.el.imgContainer = document.createElement('div');
            this.el.imgContainer.style.cssText = 'display:flex;width:100%;height:100%;align-items:center;justify-content:center;gap:5px;padding:0;margin:0;cursor:grab;touch-action:none;will-change:transform,opacity,filter';

            this.el.controls = document.createElement('div');
            this.el.controls.style.cssText = 'position:fixed;bottom:30px;right:30px;display:flex;flex-direction:column;gap:8px;background:rgba(30,30,30,0.9);padding:10px 15px;border-radius:8px;backdrop-filter:blur(10px);border:1px solid #444;color:#fff;z-index:10001;transition:opacity 0.5s;opacity:1';

            // 右上角设置控件（横向排列）
            this.el.settingsControls = document.createElement('div');
            this.el.settingsControls.style.cssText = 'position:fixed;top:30px;right:30px;display:flex;flex-direction:column;gap:8px;background:rgba(30,30,30,0.9);padding:10px 15px;border-radius:8px;backdrop-filter:blur(10px);border:1px solid #444;color:#fff;z-index:10001;transition:opacity 0.5s;opacity:1';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center';
            const secondRow = document.createElement('div');
            secondRow.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap';

            [
                ['rightBtn', '\u2192', '向右翻页', btnStyle],
                ['leftBtn', '\u2190', '向左翻页', btnStyle],
                ['offsetIncBtn', '<', '左移一页', altBtnStyle],
                ['offsetDecBtn', '>', '右移一页', altBtnStyle],
                ['directionBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['animationBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['viewModeBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['resetViewBtn', '重置', '重置视图', altBtnStyle],
                ['screenshotBtn', '截图', '拖动选择截图范围', altBtnStyle],
                ['fullScreenBtn', '', '', altBtnStyle],
                ['rotateBtn', '', '', altBtnStyle],
                ['closeBtn', '退出', '退出', `${btnStyle};background:#d33`]
            ].forEach(([key, text, title, style]) => {
                this.el[key] = createBtn(text, title, style);
            });

            this.el.pageInfo = document.createElement('span');
            this.el.pageInfo.style.cssText = 'font-size:14px;cursor:pointer;padding:0 8px';
            this.el.pageInfo.title = '点击跳转指定页码';

            this.el.toast = document.createElement('div');
            this.el.toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(30,30,30,0.92);color:#fff;font-size:13px;z-index:10004;pointer-events:none;opacity:0;transition:opacity 0.2s';

            this.el.selectionOverlay = document.createElement('div');
            this.el.selectionOverlay.style.cssText = 'position:fixed;inset:0;z-index:10003;display:none;cursor:crosshair;touch-action:none;background:rgba(10,10,10,0.01)';

            this.el.selectionHint = document.createElement('div');
            this.el.selectionHint.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(15,15,15,0.92);color:#fff;font-size:13px;pointer-events:none';
            this.el.selectionHint.textContent = '拖动选择截图范围，完成后点击保存';

            this.el.selectionToolbar = document.createElement('div');
            this.el.selectionToolbar.style.cssText = 'position:fixed;top:18px;right:18px;display:flex;gap:10px;align-items:center';

            this.el.selectionCancelBtn = document.createElement('button');
            this.el.selectionCancelBtn.type = 'button';
            this.el.selectionCancelBtn.innerText = '取消截图';
            this.el.selectionCancelBtn.style.cssText = 'padding:10px 14px;border:none;border-radius:999px;background:#d33;color:#fff;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25)';

            this.el.selectionSaveBtn = document.createElement('button');
            this.el.selectionSaveBtn.type = 'button';
            this.el.selectionSaveBtn.innerText = '保存截图';
            this.el.selectionSaveBtn.style.cssText = 'padding:10px 14px;border:none;border-radius:999px;background:#fb7299;color:#fff;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25)';

            this.el.selectionBox = document.createElement('div');
            this.el.selectionBox.style.cssText = 'position:absolute;display:none;border:2px dashed #fb7299;background:rgba(251,114,153,0.18);box-shadow:0 0 0 1px rgba(255,255,255,0.25) inset;pointer-events:none';

            this.el.selectionToolbar.append(this.el.selectionSaveBtn, this.el.selectionCancelBtn);
            this.el.selectionOverlay.append(this.el.selectionHint, this.el.selectionToolbar, this.el.selectionBox);

            row.append(this.el.leftBtn, this.el.offsetIncBtn, this.el.pageInfo, this.el.offsetDecBtn, this.el.rightBtn);
            secondRow.append(this.el.directionBtn, this.el.resetViewBtn, this.el.fullScreenBtn);
            this.el.controls.append(row, secondRow);

            // 右上角设置按钮横向排列(退出在最上面)
            this.el.settingsControls.append(this.el.closeBtn, this.el.screenshotBtn, this.el.rotateBtn, this.el.animationBtn, this.el.viewModeBtn);

            this.el.reader.append(this.el.imgContainer, this.el.controls, this.el.settingsControls, this.el.toast, this.el.selectionOverlay);

            document.body.appendChild(this.el.reader);
            this.updateDirection();
            this.syncDirectionButton();
            animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
            this.syncViewModeButton();
            this.syncRotateButton();
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        // 4. 绑定事件
        bindEvents() {
            const stop = (handler) => (e) => {
                e.stopPropagation();
                handler();
            };

            // UI 控制事件
            this.el.reader.addEventListener('mousemove', () => this.resetTimer());

            this.el.leftBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? this.lastStep : -this.lastStep);
            this.el.rightBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? -this.lastStep : this.lastStep);

            this.el.offsetIncBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? 1 : -1);
            this.el.offsetDecBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? -1 : 1);

            this.el.directionBtn.onclick = stop(() => {
                this.isRightToLeft = !this.isRightToLeft;
                this.updateDirection();
                this.syncDirectionButton();
            });

            this.el.animationBtn.onclick = stop(() => {
                this.animationMode = animations.getNextAnimationMode(this.animationMode);
                animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
            });

            this.el.viewModeBtn.onclick = stop(() => {
                const currentIdx = VIEW_MODES.indexOf(this.viewMode);
                this.viewMode = VIEW_MODES[(currentIdx + 1) % VIEW_MODES.length];
                this.syncViewModeButton();
                this.render(false);
            });

            this.el.resetViewBtn.onclick = stop(() => this.resetTransform());
            this.el.screenshotBtn.onclick = stop(() => this.startScreenshotSelection());

            this.el.fullScreenBtn.onclick = stop(() => this.toggleFullscreen());

            this.el.rotateBtn.onclick = stop(() => {
                this.rotation = (this.rotation + 90) % 360;
                this.syncRotateButton();
                this.render(false);
            });

            this.el.closeBtn.onclick = () => this.close();

            // 页码跳转
            this.el.pageInfo.onclick = stop(() => this.showJumpDialog());
            this.el.selectionCancelBtn.onclick = () => this.cancelScreenshotSelection(true);
            this.el.selectionSaveBtn.onclick = () => { void this.saveSelectionScreenshot(); };
            this.el.selectionOverlay.addEventListener('pointerdown', this.handleSelectionPointerDown);
            this.el.selectionOverlay.addEventListener('pointermove', this.handleSelectionPointerMove);
            this.el.selectionOverlay.addEventListener('pointerup', this.handleSelectionPointerUp);
            this.el.selectionOverlay.addEventListener('pointercancel', this.handleSelectionPointerUp);

            // 图片容器事件 (翻页与拖拽起冲突)
            this.el.imgContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.animateTransform();
                this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP)));
                this.applyTransform();
            }, { passive: false });

            this.el.imgContainer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.isDragging = true;
                this.initX = this.translateX;
                this.initY = this.translateY;
                this.startX = e.clientX;
                this.startY = e.clientY;
                this.el.imgContainer.style.cursor = 'grabbing';
            });

            this.el.imgContainer.addEventListener('mouseleave', () => {
                this.isDragging = false;
                this.el.imgContainer.style.cursor = 'grab';
            });

            // 注册全局事件 (需要在退出时清理)
            document.addEventListener('mousemove', this.handleMouseMove);
            document.addEventListener('mouseup', this.handleMouseUp);
            document.addEventListener('fullscreenchange', this.handleFullscreenChange);
            window.addEventListener('keydown', this.handleKeyDown);
            window.addEventListener('resize', this.handleResize);

            // 触摸滑动事件（使用已经绑定的函数引用，便于后续解绑）
            this.el.reader.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
            this.el.reader.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
            this.el.reader.addEventListener('touchend', this.boundHandleTouchEnd, { passive: false });
            this.el.reader.addEventListener('touchcancel', this.boundHandleTouchEnd, { passive: false });
            this.resetTimer();
        }

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '从右往左' : '从左往右';
            this.el.directionBtn.title = dir ? '当前：从右往左' : '当前：从左往右';
        }

        syncViewModeButton() {
            const map = { auto: ['自动', '视图模式：自动'], single: ['单图', '视图模式：单图'], double: ['双图', '视图模式：双图'] };
            const [text, title] = map[this.viewMode] || map.auto;
            Object.assign(this.el.viewModeBtn, { innerText: text, title });
        }

        syncRotateButton() {
            const rot = this.rotation;
            this.el.rotateBtn.innerText = rot === 0 ? '旋转' : `${rot}度`;
            this.el.rotateBtn.title = rot === 0 ? '旋转90度' : `当前旋转：${rot}度`;
        }

        syncFullscreenButton() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '退出全屏' : '全屏';
                this.el.fullScreenBtn.title = this.el.fullScreenBtn.innerText;
            }
        }

        toggleFullscreen() {
            if (!document.fullscreenElement) {
                this.el.reader.requestFullscreen().catch(() => { });
            } else {
                document.exitFullscreen();
            }
        }

        isCompactViewport() {
            return false;
        }

        applyResponsiveLayout() {
            this.isCompactLayout = this.isCompactViewport();
            const c = this.isCompactLayout;
            const btns = [this.el.leftBtn, this.el.rightBtn, this.el.offsetIncBtn, this.el.offsetDecBtn, this.el.directionBtn, this.el.animationBtn, this.el.viewModeBtn, this.el.resetViewBtn, this.el.screenshotBtn, this.el.fullScreenBtn, this.el.rotateBtn, this.el.closeBtn].filter(Boolean);

            btns.forEach(btn => {
                btn.style.minWidth = btn === this.el.directionBtn ? (c ? '88px' : '96px') : (c ? '54px' : '');
                btn.style.minHeight = c ? '44px' : '';
                btn.style.padding = c ? '10px 12px' : '8px 15px';
                btn.style.fontSize = c ? '14px' : '13px';
            });

            Object.assign(this.el.controls.style, {
                left: c ? '12px' : '', right: c ? '12px' : '30px', bottom: c ? '12px' : '30px',
                width: c ? 'auto' : '', padding: c ? '10px 12px' : '10px 15px'
            });

            Object.assign(this.el.settingsControls.style, {
                top: c ? '12px' : '30px', left: c ? '12px' : '', right: c ? '12px' : '30px',
                flexDirection: c ? 'row' : 'column', flexWrap: c ? 'wrap' : 'nowrap',
                justifyContent: c ? 'center' : '', padding: c ? '10px 12px' : '10px 15px'
            });

            Object.assign(this.el.pageInfo.style, { fontSize: c ? '15px' : '14px', padding: c ? '0 4px' : '0 8px' });
            Object.assign(this.el.toast.style, { top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 24px)' : 'none' });
            Object.assign(this.el.selectionHint.style, {
                top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 120px)' : 'none', fontSize: c ? '12px' : '13px'
            });
            Object.assign(this.el.selectionToolbar.style, { top: c ? '12px' : '18px', right: c ? '12px' : '18px' });

            [this.el.selectionSaveBtn, this.el.selectionCancelBtn].forEach(btn => {
                btn.style.padding = c ? '10px 12px' : '10px 14px';
                btn.style.fontSize = c ? '12px' : '13px';
            });
        }

        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        }

        getReaderPoint(clientX, clientY) {
            const rect = this.el.reader.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, clientY - rect.top))
            };
        }

        normalizeSelectionRect(start = this.selectionStart, end = this.selectionCurrent) {
            if (!start || !end) return null;
            return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        }

        hasValidSelection(rect = this.normalizeSelectionRect()) {
            return Boolean(rect && rect.width >= 8 && rect.height >= 8);
        }

        updateSelectionActions() {
            const hasSelection = this.hasValidSelection();
            this.el.selectionSaveBtn.disabled = !hasSelection;
            Object.assign(this.el.selectionSaveBtn.style, {
                opacity: hasSelection ? '1' : '0.45',
                cursor: hasSelection ? 'pointer' : 'not-allowed'
            });
        }

        updateSelectionBox() {
            const rect = this.normalizeSelectionRect();
            if (!rect) {
                this.el.selectionBox.style.display = 'none';
                return;
            }
            Object.assign(this.el.selectionBox.style, {
                display: 'block', left: `${rect.x}px`, top: `${rect.y}px`,
                width: `${rect.width}px`, height: `${rect.height}px`
            });
        }

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this.updateSelectionActions();
        }

        startScreenshotSelection() {
            if (this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = true;
            this.pageFlipToken += 1;
            this.selectionWasControlsVisible = this.controlsVisible;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'block';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            this.updateControlVisibility(false);
            if (this.hideTimer) clearTimeout(this.hideTimer);
        }

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            if (restoreControls) { this.selectionWasControlsVisible ? this.resetTimer() : this.updateControlVisibility(false); }
            if (showMessage) this.showReaderMessage('已取消截图');
        }

        handleSelectionPointerDown(e) {
            if (!this.isSelectingScreenshot || e.button === 2 || e.target.closest?.('button')) return;
            e.preventDefault();
            this.selectionPointerId = e.pointerId;
            this.isDraggingSelection = true;
            this.selectionStart = this.getReaderPoint(e.clientX, e.clientY);
            this.selectionCurrent = this.selectionStart;
            this.updateSelectionBox();
            this.updateSelectionActions();
            this.setSelectionHint('拖动调整截图范围，完成后点击保存');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        }

        handleSelectionPointerMove(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.selectionCurrent = this.getReaderPoint(e.clientX, e.clientY);
            this.updateSelectionBox();
            this.updateSelectionActions();
        }

        handleSelectionPointerUp(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.selectionCurrent = this.getReaderPoint(e.clientX, e.clientY);
            this.updateSelectionBox();
            this.el.selectionOverlay.releasePointerCapture?.(e.pointerId);
            this.updateSelectionActions();

            if (this.hasValidSelection()) {
                this.setSelectionHint('范围已选中，可点击保存，也可重新拖动重新选择');
            } else {
                this.clearSelectionBox();
                this.setSelectionHint('范围太小，请重新拖动选择');
            }
        }

        async saveSelectionScreenshot() {
            if (!this.hasValidSelection()) {
                this.showReaderMessage('请先拖动选出截图范围', true);
                return;
            }

            const success = await this.captureScreenshot(this.normalizeSelectionRect());
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        }

        updateControlVisibility(visible) {
            this.controlsVisible = visible;
            const opacity = visible ? '1' : '0';
            const pointerEvents = visible ? 'auto' : 'none';
            Object.assign(this.el.controls.style, { opacity, pointerEvents });
            Object.assign(this.el.settingsControls.style, { opacity, pointerEvents });
            this.el.reader.style.cursor = visible || this.isTouchDevice ? 'default' : 'none';
        }

        toggleControls(forceVisible) {
            const nextVisible = typeof forceVisible === 'boolean' ? forceVisible : !this.controlsVisible;
            this.updateControlVisibility(nextVisible);
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (nextVisible) {
                this.hideTimer = setTimeout(() => {
                    this.updateControlVisibility(false);
                }, this.isTouchDevice ? 3500 : CONTROLS_HIDE_DELAY);
            }
        }

        showReaderMessage(text, isError = false, duration = 2200) {
            if (!this.el.toast) return;
            if (this.messageTimer) clearTimeout(this.messageTimer);
            Object.assign(this.el.toast.style, { background: isError ? 'rgba(180, 40, 40, 0.94)' : 'rgba(30,30,30,0.92)', opacity: '1' });
            this.el.toast.textContent = text;
            this.messageTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, duration);
        }

        isInteractiveTouchTarget(target) {
            const el = target instanceof Element ? target : null;
            return el?.closest('button, a, input, textarea, select')
                || this.el.controls.contains(el)
                || this.el.settingsControls.contains(el);
        }

        handleResize() {
            this.pageFlipToken += 1;
            this.applyResponsiveLayout();
        }

        handleTapNavigation(x) {
            this.toggleControls();
        }

        clearPendingTap() {
            if (!this.pendingTapTimer) return;
            clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        }

        isTouchPanMode() {
            return this.touchPanLocked;
        }

        setTransformTransition(value) {
            if (!this.el.imgContainer) return;
            this.el.imgContainer.style.transition = value;
        }

        animateTransform(duration = 180) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.setTransformTransition(`transform ${duration}ms ease-out`);
            this.transformTransitionTimer = setTimeout(() => {
                this.transformTransitionTimer = null;
                this.setTransformTransition('none');
            }, duration);
        }

        loadExportImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => {
                    img.crossOrigin = '';
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = src;
                };
                img.src = src;
            });
        }

        getVisibleImageDescriptors() {
            const readerRect = this.el.reader.getBoundingClientRect();
            return Array.from(this.el.imgContainer.querySelectorAll('img'))
                .map(img => {
                    const rect = img.getBoundingClientRect();
                    return { src: img.currentSrc || img.src, x: rect.left - readerRect.left, y: rect.top - readerRect.top, width: rect.width, height: rect.height };
                })
                .filter(item => item.src && item.width > 0 && item.height > 0);
        }
        drawScreenshotImage(ctx, img, descriptor, selectionRect) {
            const x = descriptor.x - selectionRect.x;
            const y = descriptor.y - selectionRect.y;
            const rot = this.rotation;
            const swap = rot === 90 || rot === 270;
            const dw = swap ? descriptor.height : descriptor.width;
            const dh = swap ? descriptor.width : descriptor.height;

            ctx.save();
            ctx.translate(x + descriptor.width / 2, y + descriptor.height / 2);
            if (rot) ctx.rotate(rot * Math.PI / 180);
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        }

        canvasToBlob(canvas) {
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('EMPTY_BLOB')), 'image/png');
            });
        }

        shouldCopyScreenshotToClipboard() {
            return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        }

        async copyBlobToClipboard(blob) {
            if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
                throw new Error('CLIPBOARD_UNAVAILABLE');
            }

            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type || 'image/png']: blob
                })
            ]);
        }

        async shareScreenshot(blob, filename) {
            if (typeof File === 'undefined' || !navigator.share) {
                throw new Error('SHARE_UNAVAILABLE');
            }

            const file = new File([blob], filename, { type: blob.type || 'image/png' });
            const data = {
                files: [file],
                title: filename
            };

            if (navigator.canShare && !navigator.canShare(data)) {
                throw new Error('SHARE_UNAVAILABLE');
            }

            await navigator.share(data);
        }

        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        async outputScreenshot(blob, filename) {
            if (this.shouldCopyScreenshotToClipboard()) {
                try { await this.copyBlobToClipboard(blob); this.showReaderMessage('截图已复制到剪贴板'); return; } catch (_) { this.downloadBlob(blob, filename); this.showReaderMessage('剪贴板不可用，已改为保存文件', true, 2600); return; }
            }
            if (navigator.share) {
                try { await this.shareScreenshot(blob, filename); this.showReaderMessage('截图已打开系统分享'); return; } catch (_) { }
            }
            this.downloadBlob(blob, filename);
            this.showReaderMessage('截图已保存');
        }

        getScreenshotFileName(count) {
            const start = this.currentIndex + 1;
            const end = this.currentIndex + count;
            const range = count === 1 ? `${start}` : `${start}-${end}`;
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            return `bilibili-reader-${range}-${stamp}.png`;
        }

        async captureScreenshot(selectionRect) {
            const descriptors = this.getVisibleImageDescriptors();
            if (descriptors.length === 0) {
                this.showReaderMessage('当前没有可截图的页面', true);
                return false;
            }

            this.showReaderMessage('正在生成截图...', false, 3000);

            try {
                const loadedImages = await Promise.all(descriptors.map(async descriptor => {
                    const image = await this.loadExportImage(descriptor.src);
                    if (!image) throw new Error('LOAD_FAILED');
                    return { descriptor, image };
                }));

                const dpr = window.devicePixelRatio || 1;
                const output = document.createElement('canvas');
                output.width = Math.max(1, Math.round(selectionRect.width * dpr));
                output.height = Math.max(1, Math.round(selectionRect.height * dpr));

                const ctx = output.getContext('2d');
                if (!ctx) throw new Error('CANVAS_CONTEXT_FAILED');
                ctx.scale(dpr, dpr);
                ctx.fillStyle = READER_BACKGROUND;
                ctx.fillRect(0, 0, selectionRect.width, selectionRect.height);

                loadedImages.forEach(({ descriptor, image }) => {
                    this.drawScreenshotImage(ctx, image, descriptor, selectionRect);
                });

                const blob = await this.canvasToBlob(output);
                await this.outputScreenshot(blob, this.getScreenshotFileName(this.activePageCount));
                return true;
            } catch (error) {
                this.showReaderMessage('截图失败，当前图源可能限制导出', true, 2800);
                return false;
            }
        }

        // 触摸事件处理
        handleTouchStart(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2) {
                // 双指缩放开启
                e.preventDefault();
                this.clearPendingTap();
                this.setTransformTransition('none');
                this.isTwoFingerGesturing = true;
                this.touchPanLocked = true;
                this.touchDidMoveImage = false;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                this.initialScale = this.scale;
                this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                this.twoFingerTapCandidate = true;
                this.twoFingerTapStartTime = Date.now();
                this.twoFingerTapCenterX = this.initialCenterX;
                this.twoFingerTapCenterY = this.initialCenterY;
                return;
            }

            if (e.touches.length === 1) {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchEndX = this.touchStartX;
                this.touchEndY = this.touchStartY;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchStartTime = Date.now();
                this.touchStartedOnInteractive = this.isInteractiveTouchTarget(e.target);
                this.initX = this.translateX;
                this.initY = this.translateY;
                if (this.touchStartedOnInteractive) {
                    this.resetTimer();
                }
            }
        }

        handleTouchMove(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2 && this.isTwoFingerGesturing) {
                // 双指缩放中
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                const scaleFactor = currentDistance / this.initialPinchDistance;
                this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.initialScale * scaleFactor));

                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                if (Math.abs(currentDistance - this.initialPinchDistance) > 8
                    || Math.abs(currentCenterX - this.twoFingerTapCenterX) > 8
                    || Math.abs(currentCenterY - this.twoFingerTapCenterY) > 8) {
                    this.twoFingerTapCandidate = false;
                }
                this.translateX += currentCenterX - this.initialCenterX;
                this.translateY += currentCenterY - this.initialCenterY;
                this.initialCenterX = currentCenterX;
                this.initialCenterY = currentCenterY;

                this.applyTransform();
                return;
            }

            if (e.touches.length === 1) {
                this.touchEndX = e.touches[0].clientX;
                this.touchEndY = e.touches[0].clientY;

                const moveX = this.touchEndX - this.touchStartX;
                const moveY = this.touchEndY - this.touchStartY;
                const deltaX = Math.abs(moveX);
                const deltaY = Math.abs(moveY);

                if (this.isTouchPanMode() && !this.touchStartedOnInteractive) {
                    if (deltaX > 4 || deltaY > 4) {
                        e.preventDefault();
                        this.setTransformTransition('none');
                        this.touchDidMoveImage = true;
                        this.translateX = this.initX + moveX;
                        this.translateY = this.initY + moveY;
                        this.applyTransform();
                    }
                    return;
                }

                if (deltaX > 10 || deltaY > 10) {
                    this.isTouchSwiping = true;
                    if (deltaX > deltaY) {
                        e.preventDefault();
                    }
                }
            }
        }

        handleTouchEnd(e) {
            if (this.isSelectingScreenshot) return;
            if (e.type === 'touchcancel') {
                this.clearPendingTap();
                this.isTwoFingerGesturing = false;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.twoFingerTapCandidate = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                const isTwoFingerTap = this.twoFingerTapCandidate
                    && Date.now() - this.twoFingerTapStartTime < 300;
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
                if (isTwoFingerTap) {
                    const now = Date.now();
                    const isDoubleTwoFingerTap = now - this.lastTwoFingerTapTime < 320
                        && Math.abs(this.twoFingerTapCenterX - this.lastTwoFingerTapCenterX) < 40
                        && Math.abs(this.twoFingerTapCenterY - this.lastTwoFingerTapCenterY) < 40;

                    if (isDoubleTwoFingerTap) {
                        this.lastTwoFingerTapTime = 0;
                        this.lastTwoFingerTapCenterX = 0;
                        this.lastTwoFingerTapCenterY = 0;
                        this.resetTransform();
                    } else {
                        this.lastTwoFingerTapTime = now;
                        this.lastTwoFingerTapCenterX = this.twoFingerTapCenterX;
                        this.lastTwoFingerTapCenterY = this.twoFingerTapCenterY;
                    }
                }
                return;
            }

            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const threshold = SWIPE_THRESHOLD;
            const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && Date.now() - this.touchStartTime < 300;

            if (this.touchDidMoveImage) {
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                return;
            }

            if (isTap) {
                if (!this.touchStartedOnInteractive) {
                    e.preventDefault();
                    this.clearPendingTap();
                    this.pendingTapTimer = setTimeout(() => {
                        this.pendingTapTimer = null;
                        this.handleTapNavigation(this.touchEndX);
                    }, 220);
                }
                this.isTouchSwiping = false;
                return;
            }

            this.clearPendingTap();
            if (!this.isTouchSwiping || (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold)) {
                return;
            }

            if (Math.abs(deltaX) > threshold) {
                const dir = (deltaX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                this.turnPage(null, dir);
            }

            this.isTouchSwiping = false;
        }

        // 5. 核心渲染逻辑 (处理动画切换)
        render(animate = true, step = 0) {
            const renderIndex = this.currentIndex;
            const transitionToken = ++this.pageFlipToken;
            animations.runTransition({
                animate,
                imgContainer: this.el.imgContainer,
                animationMode: this.animationMode,
                step,
                isRightToLeft: this.isRightToLeft,
                lastStep: this.lastStep,
                renderIndex,
                getCurrentIndex: () => this.currentIndex,
                transitionToken,
                getTransitionToken: () => this.pageFlipToken,
                loadImages: (index, mode, direction) => { void this.loadImages(index, mode, direction); }
            });
        }

        // 6. 智能图片加载逻辑 (决定单双页)
        async loadImages(renderIndex, animationMode = 'none', transitionDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            animations.resetImageContainer(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform()
            );
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;

            const img1 = await this.loadImage(this.imgList[this.currentIndex]);
            if (!img1 || renderIndex !== this.currentIndex) return;

            const canUseDoubleMode = this.viewMode === 'double' || (this.viewMode === 'auto' && !this.isWideImage(img1));
            if (!canUseDoubleMode || this.currentIndex + 1 >= this.imgList.length) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const img2 = await this.loadImage(this.imgList[this.currentIndex + 1]);
            if (!img2 || renderIndex !== this.currentIndex) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const images = this.viewMode === 'auto' && this.isWideImage(img2) ? [img1] : [img1, img2];
            this.commitImages(images, animationMode, this.currentIndex + 2, transitionDirection);
        }

        loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        isWideImage(img) {
            const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
            const width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
            const height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;
            return width > height * 1.2;
        }

        commitImages(images, animationMode, preloadStart, transitionDirection = 0) {
            const isFull = images.length === 1;
            if (animationMode === 'none') {
                this.el.imgContainer.innerHTML = '';
                images.forEach(img => {
                    this.setupImg(img, isFull);
                    this.el.imgContainer.appendChild(img);
                });
            } else if (animationMode === 'book') {
                // TODO: 书本动画实现时，创建 newWrapper 包裹新图片
                // const newWrapper = document.createElement('div');
                // newWrapper.className = 'bilibili-anim-new';
                // ...
                images.forEach(img => {
                    this.setupImg(img, isFull);
                    this.el.imgContainer.appendChild(img);
                });
            } else {
                // smooth / fade
                images.forEach(img => {
                    this.setupImg(img, isFull);
                    this.el.imgContainer.appendChild(img);
                });
            }
            this.updatePageInfo(images.length);
            animations.finishRender(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform()
            );
            this.preloadImages(preloadStart);
        }

        // 辅助：设置图片样式
        setupImg(img, isFull) {
            const rotated = this.rotation === 90 || this.rotation === 270;
            Object.assign(img.style, {
                maxWidth: rotated ? '100vh' : (isFull ? '100%' : '50%'),
                maxHeight: rotated ? (isFull ? '100vw' : '50vw') : '100vh',
                objectFit: 'contain', flexShrink: '0',
                transform: this.rotation ? `rotate(${this.rotation}deg)` : ''
            });
        }

        // 辅助：完成渲染并触发

        // 翻页相关方法

        turnPage(e, step) {
            e?.stopPropagation?.();
            if (!this.canGoForward(step)) step = step > 0 ? 1 : -1;
            if (!this.canGoForward(step)) return;
            this.currentIndex += step;
            this.render(true, step);
        }

        offsetPage(e, step) {
            e?.stopPropagation?.();
            const idx = this.currentIndex + step;
            if (idx >= 0 && idx < this.imgList.length) {
                this.currentIndex = idx;
                this.render(true, step);
            }
        }

        showJumpDialog() {
            const total = this.imgList.length;
            const input = prompt(`当前页码: ${this.currentIndex + 1} / ${total}\n请输入要跳转的页码(1-${total}):`);
            if (input === null) return;
            const page = parseInt(input, 10);
            if (isNaN(page) || page < 1 || page > total) { if (input.trim()) alert(`请输入1-${total} 之间的有效数字`); return; }
            const step = page - 1 - this.currentIndex;
            this.currentIndex = page - 1;
            this.render(true, step);
        }

        canGoForward(step) {
            const newIndex = this.currentIndex + step;
            return newIndex >= 0 && newIndex < this.imgList.length;
        }

        updatePageInfo(step) {
            this.activePageCount = step;
            this.lastStep = step;
            const total = this.imgList.length;
            this.el.pageInfo.innerText = step === 1
                ? `${this.currentIndex + 1} / ${total}`
                : `${this.currentIndex + 1}-${this.currentIndex + step} / ${total}`;
        }

        preloadImages(start, count = PRELOAD_COUNT) {
            for (let i = start; i < start + count && i < this.imgList.length; i++) {
                new Image().src = this.imgList[i];
            }
        }

        updateDirection() {
            if (this.el.imgContainer) this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
        }

        resetTransform() {
            this.clearPendingTap();
            this.animateTransform(220);
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.rotation = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.lastTapTime = 0;
            this.twoFingerTapCandidate = false;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;
            this.syncRotateButton();
            this.applyTransform();
            this.el.imgContainer.querySelectorAll('img').forEach(img => {
                const isFull = img.style.maxWidth === '100%' || img.style.maxHeight === '100vw';
                img.style.transform = '';
                img.style.maxWidth = isFull ? '100%' : '50%';
                img.style.maxHeight = '100vh';
            });
        }

        applyTransform() {
            if (this.el.imgContainer) this.el.imgContainer.style.transform = `scale(${this.scale}) translate(${this.translateX}px,${this.translateY}px)`;
        }

        resetTimer() {
            if (this.isSelectingScreenshot) return;
            this.toggleControls(true);
        }

        // 全局事件处理函数

        handleMouseMove(e) {
            if (!this.isDragging) return;
            this.translateX = this.initX + (e.clientX - this.startX);
            this.translateY = this.initY + (e.clientY - this.startY);
            this.applyTransform();
        }

        handleMouseUp() {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.el.imgContainer.style.cursor = 'grab';
        }

        handleFullscreenChange() {
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        handleKeyDown(e) {
            if (this.isSelectingScreenshot) {
                if (e.key === 'Escape') this.cancelScreenshotSelection(true);
                if (e.key === 'Enter') void this.saveSelectionScreenshot();
                return;
            }
            if (e.key === 'ArrowLeft') this.el.leftBtn.click();
            else if (e.key === 'ArrowRight') this.el.rightBtn.click();
            else if (e.key.toLowerCase() === 's') this.startScreenshotSelection();
            else if (e.key === 'Escape') this.close();
        }

        // 清理并关闭
        close() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.clearPendingTap();
            this.pageFlipToken += 1;
            this.cancelScreenshotSelection(false, false);

            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
            document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
            window.removeEventListener('keydown', this.handleKeyDown);
            window.removeEventListener('resize', this.handleResize);

            if (this.el.reader) {
                this.el.reader.removeEventListener('touchstart', this.boundHandleTouchStart);
                this.el.reader.removeEventListener('touchmove', this.boundHandleTouchMove);
                this.el.reader.removeEventListener('touchend', this.boundHandleTouchEnd);
                this.el.reader.removeEventListener('touchcancel', this.boundHandleTouchEnd);
                this.el.selectionOverlay.removeEventListener('pointerdown', this.handleSelectionPointerDown);
                this.el.selectionOverlay.removeEventListener('pointermove', this.handleSelectionPointerMove);
                this.el.selectionOverlay.removeEventListener('pointerup', this.handleSelectionPointerUp);
                this.el.selectionOverlay.removeEventListener('pointercancel', this.handleSelectionPointerUp);
                this.el.reader.remove();
                this.el = {};
            }

            // 显示收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = '';
        }
    }


    // ============ 入口函数 ============
    // 检查URL是否匹配漫画模式
    function shouldInitComicReader() {
        const url = window.location.href;
        return COMIC_URL_PATTERNS.some(pattern => url.includes(pattern));
    }

    // 初始化
    function init() {
        // 数据迁移：检查并迁移旧版本数据
        initializeToolboxData(function() {
            // 收藏夹功能：所有页面初始化
            initFavorites();

            // 漫画模式：只在特定URL下初始化
            if (shouldInitComicReader()) {
                new BiliComicReader().init();
            }
        });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();


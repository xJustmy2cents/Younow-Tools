import { log, error, prettify } from "./modules/module_log"

import * as _async from "async"
import { getURL, req, download } from "./modules/module_www"
import { hls } from "./modules/module_hls"
import { cleanFilename } from "./modules/module_utils"
import * as dos from "./modules/module_promixified"
import * as fs from "fs"
import * as path from "path"

import * as _younow from "./module_younow"
import * as periscope from "./module_periscope"

export function cmdLive(settings: Settings, users: string[]) {

	if (settings.younow) {
		_younow.openDB()
			.then((db: DB) => {
				_async.eachSeries(users, function(user, cbAsync) {
					user = _younow.extractUser(user)

					let p = isNaN(user) ? _younow.getLiveBroadcastByUsername(user) : _younow.getLiveBroadcastByUID(user)

					p.then(live => {
						if (live.errorCode) {
							error(`${user} ${live.errorCode} ${live.errorMsg}`)
						}
						else if (live.state != "onBroadcastPlay") {
							error(`${live.state} ${live.stateCopy}`)
						}
						else {
							_younow.downloadThemAll(live)
								.then(result => {
									log(`${live.profile} broadcast is over`)
									return true
								}, error)
						}
					}, error)
						.then(() => {
							cbAsync()
						})
				})
			})
			.catch(error)
	}
	else if (settings.vk) {
		_async.eachSeries(users, (user: string, cb) => {

			// user == url:string as https://vk.com/video_ext.php?oid=${broadcastId}&id=${userId}&hash=${wtf}

			log("try to resolve", user)

			getURL(user, null)
				.then(async body => {

					let m = body.toString().match(/playerParams.=.(.+?);\n/)

					if (m) {
						let json: VK.VarParams = JSON.parse(m[1])
						let params = json.params[0]

						let basename = path.join(settings.pathDownload, cleanFilename(params.md_author +
							"_" + params.md_title +
							"_" + params.vid +
							"_" + params.oid)) + "."


						if (params.mp4 || params.postlive_mp4) {

							// archived live
							log("download archived live", user)

							await download(params.mp4 || params.postlive_mp4, basename + "mp4")
						}
						else if (params.hls) {

							// live stream

							log("download live", user)

							let playlist = params.hls.split("?extra=")[0]

							if (settings.thumbnail) {

								await download(params.jpg, basename + "jpg")
							}

							if (settings.json) {
								dos.writeFile(basename + "json", JSON.stringify(json, null, "\t")).catch(error)
							}

							hls(playlist, basename + settings.videoFormat, settings.useFFMPEG, 0, true, cb)
						}
					}
					else {

						/*
						<div id="video_ext_msg">
						This video has been removed from public access.
						</div>
						 */
						log(body.toString().match(/<div.id="video_ext_msg">\s*(.+?)\s*<\/div>/)[1])
					}
				})
				.catch(error)
		})

	}
	else if (settings.periscope) {
		_async.eachSeries(users, (user: string, cb) => {
			/*
				bid
			or
				https://www.pscp.tv/username/bid
			or
				https://www.pscp.tv/w/bid

			*/

			log("try to resolve", user)

			let pos = user.lastIndexOf("/")

			periscope.getBroadcast(user.substring(pos + 1))
				.then(video => {

					log("download", video.broadcast.user_display_name, video.broadcast.status)

					let basename = periscope.createFilename(video.broadcast)

					if (settings.thumbnail) {
						periscope.downloadThumbnail(video.broadcast).catch(error)
					}
					if (settings.json) {
						dos.writeFile(basename + ".json", JSON.stringify(video, null, "\t")).catch(error)
					}

					return periscope.downloadVideo(basename + "." + settings.videoFormat, video)
				})
				.catch(error)
		})
	}
	else {
		error("Not Implemented")
	}
}

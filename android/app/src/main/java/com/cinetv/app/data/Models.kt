package com.cinetv.app.data

// Modelos que reflejan las respuestas del backend (live.cd.com.py/api).

data class LoginReq(val username: String, val password: String)
data class UserResp(val user: User?)
data class User(val id: Long, val username: String, val role: String?)

// Tarjeta común para película, serie o canal (los campos sobrantes quedan null).
data class Card(
    // id es numérico para pelis/series ("9") y texto para canales ("Telefuturo.py").
    val id: String = "",
    val type: String? = null,
    val title: String? = null,
    val name: String? = null,
    val poster: String? = null,
    val logo: String? = null,
    val backdrop: String? = null,
    val year: Int? = null,
    val category: String? = null,
    val country: String? = null,
    val rating: Double? = null,
    val available: Boolean? = null,
) {
    val displayTitle: String get() = title ?: name ?: "—"
    val image: String? get() = poster ?: logo ?: backdrop
    val kind: String get() = type ?: "channel" // /api/home no manda type -> canal
}

data class Row(
    val key: String? = null,
    val title: String? = null,
    val nav: String? = null,
    val items: List<Card>? = null,
)

data class HomeResp(val featured: List<Card>? = null, val rows: List<Row>? = null)
data class ChannelsHome(val country: String? = null, val rows: List<Row>? = null)
data class ChannelList(val total: Int = 0, val items: List<Card>? = null)

data class Stream(val url: String? = null, val userAgent: String? = null, val referrer: String? = null)

data class MovieDetail(
    val id: Long = 0,
    val title: String? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val overview: String? = null,
    val year: Int? = null,
    val rating: Double? = null,
    val runtime: Int? = null,
    val genres: List<String>? = null,
    val available: Boolean? = null,
    val streamUrl: String? = null,
    val streams: List<Stream>? = null,
)

data class Episode(
    val id: Long = 0,
    val season: Int = 1,
    val episode: Int = 0,
    val title: String? = null,
    val overview: String? = null,
    val still: String? = null,
    val available: Boolean? = null,
    val streamUrl: String? = null,
)

data class SerieDetail(
    val id: Long = 0,
    val title: String? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val overview: String? = null,
    val year: Int? = null,
    val genres: List<String>? = null,
    val episodes: List<Episode>? = null,
)

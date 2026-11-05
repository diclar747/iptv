package com.cinetv.app.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query


interface Api {
    @GET("api/channels/status")
    suspend fun channelStatuses(@Query("ids") ids: String): List<ChannelHealth>

    @GET("api/radios")
    suspend fun radios(): RadiosResp

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginReq): UserResp

    @GET("api/auth/me")
    suspend fun me(): UserResp

    @GET("api/meta")
    suspend fun meta(): Meta

    @GET("api/geo")
    suspend fun geo(): GeoResp

    // URL absoluta y FIRMADA (con token) para proyectar a Chromecast/Smart TV
    // sin cookie de sesión (el receptor del TV la abre directo).
    @GET("api/cast-url")
    suspend fun castUrl(
        @Query("url") url: String,
        @Query("ua") ua: String? = null,
        @Query("ref") ref: String? = null,
    ): CastUrlResp

    @GET("api/app/version")
    suspend fun appVersion(): AppVersion

    @GET("api/catalog/favorites")
    suspend fun favorites(): List<Card>

    @GET("api/catalog/search")
    suspend fun search(@Query("q") q: String): SearchResp

    @GET("api/catalog/home")
    suspend fun catalogHome(): HomeResp

    @GET("api/home")
    suspend fun channelsHome(): ChannelsHome

    @GET("api/catalog/movies")
    suspend fun movies(
        @Query("search") search: String? = null,
        @Query("category") category: String? = null,
        @Query("pageSize") pageSize: Int = 60,
    ): List<Card>

    @GET("api/catalog/series")
    suspend fun seriesList(@Query("search") search: String? = null): List<Card>

    @GET("api/catalog/movies/{id}")
    suspend fun movie(@Path("id") id: Long): MovieDetail

    @GET("api/catalog/series/{id}")
    suspend fun serie(@Path("id") id: Long): SerieDetail

    @GET("api/channels")
    suspend fun channels(
        @Query("country") country: String? = null,
        @Query("category") category: String? = null,
        @Query("search") search: String? = null,
        @Query("prefer") prefer: String? = null,
        @Query("pageSize") pageSize: Int = 80,
        @Query("page") page: Int = 1,
        @Query("status") status: String? = null,
    ): ChannelList

    @GET("api/channels/{id}/streams")
    suspend fun channelStreams(@Path("id") id: String): ChannelStreamsResp

    @POST("api/catalog/favorites")
    suspend fun addFavorite(@Body body: FavReq)

    // Me gusta y comentarios (compartidos entre usuarios).
    @GET("api/catalog/reactions")
    suspend fun reactions(@Query("type") type: String, @Query("id") id: String): ReactionsResp

    @POST("api/catalog/likes")
    suspend fun toggleLike(@Body body: ReactReq): LikeResp

    @POST("api/catalog/comments")
    suspend fun addComment(@Body body: CommentReq): Comment

    @DELETE("api/catalog/comments/{id}")
    suspend fun deleteComment(@Path("id") id: String)

    // ---------- Panel distribuidor (reseller) ----------
    @GET("api/reseller/me")
    suspend fun resellerMe(): ResellerMe

    @GET("api/reseller/clients")
    suspend fun clients(): List<ClientUser>

    @POST("api/reseller/clients")
    suspend fun createClient(@Body body: CreateClientReq): ClientUser

    @POST("api/reseller/clients/{id}/renew")
    suspend fun renewClient(@Path("id") id: String, @Body body: PackageIdReq): ClientUser

    @PATCH("api/reseller/clients/{id}")
    suspend fun setClientStatus(@Path("id") id: String, @Body body: StatusReq): ClientUser

    @GET("api/reseller/subresellers")
    suspend fun subresellers(): List<SubReseller>

    @POST("api/reseller/subresellers")
    suspend fun createSubreseller(@Body body: CreateSubReq): SubReseller

    @POST("api/reseller/subresellers/{id}/credits")
    suspend fun transferToSub(@Path("id") id: String, @Body body: AmountReq): SubReseller

    @GET("api/reseller/transactions")
    suspend fun transactions(): List<Tx>

    @GET("api/packages")
    suspend fun packages(): List<Pkg>

    @GET("api/profile")
    suspend fun profile(): Profile

    @PATCH("api/profile")
    suspend fun updateProfile(@Body body: ProfileUpdate): Profile

    @GET("api/billing/provider")
    suspend fun billingProvider(): ProviderBilling

    @POST("api/credit-requests")
    suspend fun createCreditRequest(@Body body: CreditReqReq): CreditRequest

    @GET("api/credit-requests/mine")
    suspend fun myCreditRequests(): List<CreditRequest>

    @GET("api/reseller/credit-requests")
    suspend fun resellerCreditRequests(): List<CreditRequest>

    @POST("api/credit-requests/{id}/approve")
    suspend fun approveCreditRequest(@Path("id") id: String): CreditRequest

    @POST("api/credit-requests/{id}/reject")
    suspend fun rejectCreditRequest(@Path("id") id: String): CreditRequest
}

// ---------- Modelos del panel distribuidor ----------
data class ResellerMe(
    val credits: Int? = null, val unlimited: Boolean = false,
    val clients: Int = 0, val clientsActive: Int = 0,
)
data class ClientUser(
    val id: String = "", val username: String = "", val status: String? = null,
    val packageName: String? = null, val expiresAt: String? = null, val maxConnections: Int? = null,
)
data class SubReseller(
    val id: String = "", val username: String = "", val credits: Int = 0,
    val clientCount: Int = 0, val status: String? = null,
)
data class Pkg(
    val id: String = "", val name: String? = null, val durationDays: Int = 0, val credits: Int = 0,
    val maxConnections: Int = 1, val adminPrice: Double? = null, val suggestedPrice: Double? = null,
)
data class Tx(val id: String = "", val at: String? = null, val type: String? = null, val amount: Int = 0, val note: String? = null)
data class Profile(
    val username: String = "", val role: String? = null, val credits: Int? = null,
    val displayName: String? = null, val phone: String? = null, val address: String? = null,
    val affiliateCode: String? = null,
    val bankName: String? = null, val bankHolder: String? = null, val bankAccount: String? = null,
    val bankAlias: String? = null, val bankDoc: String? = null,
)
data class ProviderBilling(
    val username: String? = null, val displayName: String? = null, val phone: String? = null,
    val bankName: String? = null, val bankHolder: String? = null, val bankAccount: String? = null,
    val bankAlias: String? = null, val bankDoc: String? = null,
)
data class CreditRequest(
    val id: String = "", val kind: String = "credits", val amount: Int = 0,
    val status: String = "pending", val note: String? = null, val createdAt: String? = null,
    val requester: String? = null,
)

// Cuerpos de petición
data class CreateClientReq(val username: String, val password: String, val packageId: Int)
data class PackageIdReq(val packageId: Int)
data class StatusReq(val status: String)
data class CreateSubReq(val username: String, val password: String, val credits: Int)
data class AmountReq(val amount: Int)
data class CreditReqReq(val kind: String, val amount: Int)
data class ProfileUpdate(
    val displayName: String? = null, val phone: String? = null, val address: String? = null,
    val bankName: String? = null, val bankHolder: String? = null, val bankAccount: String? = null,
    val bankAlias: String? = null, val bankDoc: String? = null,
)

data class FavReq(val type: String, val id: Long)

data class ChannelStreamsResp(val streams: List<Stream>? = null)
data class SearchResp(val movies: List<Card>? = null, val series: List<Card>? = null)

data class ReactReq(val type: String, val id: String, val value: Int = 1)
data class CommentReq(val type: String, val id: String, val body: String)
data class LikeResp(val liked: Boolean = false, val likes: Int = 0, val disliked: Boolean = false, val dislikes: Int = 0)
data class Comment(
    val id: String = "",
    val author: String? = null,
    val body: String? = null,
    val created: String? = null,
    val mine: Boolean = false,
)
data class ReactionsResp(
    val dislikes: Int = 0,
    val disliked: Boolean = false,
    val likes: Int = 0,
    val liked: Boolean = false,
    val comments: List<Comment> = emptyList(),
)

data class RadioStation(val id: String, val name: String, val url: String, val city: String = "", val tags: String = "", val codec: String = "", val source: String? = null, val logo: String? = null, val status: String = "checking", val checkedAt: String? = null)
data class RadiosResp(val items: List<RadioStation> = emptyList(), val total: Int = 0)

data class ChannelHealth(val id: String, val status: String = "unchecked", val checkedAt: String? = null)

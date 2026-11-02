package com.cinetv.app.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface Api {
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginReq): UserResp

    @GET("api/auth/me")
    suspend fun me(): UserResp

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
        @Query("search") search: String? = null,
        @Query("pageSize") pageSize: Int = 80,
    ): ChannelList

    @GET("api/channels/{id}/streams")
    suspend fun channelStreams(@Path("id") id: String): ChannelStreamsResp
}

data class ChannelStreamsResp(val streams: List<Stream>? = null)

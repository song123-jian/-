package com.song123jian.pricequery.mobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MesCredentialPersistenceTest {
    @Test
    fun credentialPersistenceFailureReturnsWarningWithoutFailingLoginStep() {
        assertNull(mesCredentialPersistenceWarning(rememberCredentials = true) { })
        assertEquals(
            "MES已登录，但本机加密凭据保存失败：存储不可用",
            mesCredentialPersistenceWarning(rememberCredentials = true) { error("存储不可用") },
        )
        assertEquals(
            "MES已登录，但本机保存凭据清除失败：存储不可用",
            mesCredentialPersistenceWarning(rememberCredentials = false) { error("存储不可用") },
        )
    }
}

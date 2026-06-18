package com.injectmes.aspect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.injectmes.annotation.OperationLog;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.service.SystemService;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;

/**
 * 操作日志AOP切面
 * 拦截带有 @OperationLog 注解的方法，自动记录操作日志
 */
@Aspect
@Component
public class OperationLogAspect {

    @Autowired
    private SystemService systemService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 环绕通知，拦截带有 @OperationLog 注解的方法
     * 记录操作前后的数据变化
     */
    @Around("@annotation(com.injectmes.annotation.OperationLog)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        // 获取方法签名和注解信息
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        OperationLog operationLog = method.getAnnotation(OperationLog.class);

        String module = operationLog.module();
        String action = operationLog.action();

        // 获取当前登录用户信息
        Long userId = null;
        String username = "匿名用户";
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            userId = userDetails.getUserId();
            username = userDetails.getUsername();
        }

        // 获取请求IP
        String ip = getIpAddress();

        // 记录操作前的参数值（作为oldValue）
        String oldValue = null;
        Object[] args = joinPoint.getArgs();
        if (args != null && args.length > 0) {
            try {
                // 将方法参数序列化为JSON作为旧值记录
                oldValue = objectMapper.writeValueAsString(args);
                // 限制长度，避免日志过大
                if (oldValue.length() > 2000) {
                    oldValue = oldValue.substring(0, 2000) + "...";
                }
            } catch (Exception e) {
                oldValue = "参数序列化失败";
            }
        }

        // 执行目标方法
        Object result = joinPoint.proceed();

        // 记录操作后的返回值（作为newValue）
        String newValue = null;
        if (result != null) {
            try {
                newValue = objectMapper.writeValueAsString(result);
                if (newValue.length() > 2000) {
                    newValue = newValue.substring(0, 2000) + "...";
                }
            } catch (Exception e) {
                newValue = "返回值序列化失败";
            }
        }

        // 调用SystemService记录日志
        systemService.recordLog(userId, username, module, action,
                null, null, oldValue, newValue, ip);

        return result;
    }

    /**
     * 获取客户端IP地址
     */
    private String getIpAddress() {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return "未知";
        }
        HttpServletRequest request = attributes.getRequest();
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // 多个代理时取第一个IP
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }
}

package com.injectmes.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web配置类，配置静态资源映射
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${file.upload-path:./uploads/}")
    private String uploadPath;

    @Value("${file.access-path:/uploads/**}")
    private String accessPath;

    /**
     * 配置静态资源映射，将上传文件目录映射为可访问的URL路径
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 将/uploads/**路径映射到上传文件目录
        String resourceLocation = uploadPath;
        if (!resourceLocation.endsWith("/") && !resourceLocation.endsWith("\\")) {
            resourceLocation = resourceLocation + "/";
        }
        // 确保路径以file:协议开头
        if (!resourceLocation.startsWith("file:")) {
            resourceLocation = "file:" + resourceLocation;
        }
        registry.addResourceHandler(accessPath)
                .addResourceLocations(resourceLocation);
    }
}
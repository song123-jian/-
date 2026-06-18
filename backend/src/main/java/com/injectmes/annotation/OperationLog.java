package com.injectmes.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 操作日志注解
 * 标注在需要记录操作日志的方法上，由AOP切面自动拦截并记录
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface OperationLog {

    /** 模块名称（如：用户管理、产品管理等） */
    String module();

    /** 操作动作（如：新增、修改、删除等） */
    String action();
}

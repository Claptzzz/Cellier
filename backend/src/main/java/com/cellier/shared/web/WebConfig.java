package com.cellier.shared.web;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

import java.util.EnumSet;
import jakarta.servlet.DispatcherType;

@Configuration
public class WebConfig {

    @Bean
    public FilterRegistrationBean<SpaForwardFilter> spaForwardFilter() {
        FilterRegistrationBean<SpaForwardFilter> registration =
                new FilterRegistrationBean<>(new SpaForwardFilter());
        registration.addUrlPatterns("/*");
        registration.setDispatcherTypes(EnumSet.of(DispatcherType.REQUEST));
        // Después de la cadena de Spring Security (orden -100) y antes del DispatcherServlet.
        registration.setOrder(Ordered.LOWEST_PRECEDENCE - 10);
        return registration;
    }
}

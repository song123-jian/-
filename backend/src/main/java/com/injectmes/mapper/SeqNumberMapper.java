package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.SeqNumber;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SeqNumberMapper extends BaseMapper<SeqNumber> {

    /**
     * 原子递增并返回新值（利用行锁保证并发安全）
     * 使用 UPDATE ... WHERE seq_type=? AND seq_date=? 返回受影响行数，
     * 若受影响行数为0则 INSERT 新行，再递增。
     */
    @Update("UPDATE seq_number SET current_seq = current_seq + 1 WHERE seq_type = #{seqType} AND seq_date = #{seqDate}")
    int incrementSeq(@Param("seqType") String seqType, @Param("seqDate") String seqDate);
}
